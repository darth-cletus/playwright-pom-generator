import {useEffect, useRef, useState} from 'react';
import {recordingPort, readRecordedStep, readWorkflow, workflowLimit, workflowModel,
  type RecordingCommand, type RecordingEvent, type Workflow} from '../core/workflow';
import {generate, pythonLocator} from '../core/python';
import type {GenerationProfile} from '../core/generation-profile';
import type {RuntimeResult} from '../core/runtime';
import type {Locator} from '../core/locator';

type Phase = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'interrupted';
const draftKey = 'workflowDraft';
const empty = (): Workflow => ({schemaVersion: 1, name: 'recorded_flow', steps: []});

export function useWorkflow() {
  const [workflow, setWorkflow] = useState<Workflow>(empty);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [skipped, setSkipped] = useState(0);
  const active = useRef<{port: chrome.runtime.Port; session: string; tab: number; sequence: number; stopping: boolean} | undefined>(undefined);
  const scope = useRef<{tab: number; origin: string} | undefined>(undefined);
  const current = useRef(workflow);
  const undo = useRef<Workflow[]>([]);
  const redo = useRef<Workflow[]>([]);

  function replace(next: Workflow, remember = false) {
    if (remember) {
      undo.current = [...undo.current.slice(-29), current.current];
      redo.current = [];
    }
    current.current = next;
    setWorkflow(next);
  }

  function moveHistory(back: boolean) {
    const source = back ? undo : redo;
    const destination = back ? redo : undo;
    const next = source.current.pop();
    if (!next) return;
    destination.current.push(current.current);
    replace(next);
  }

  function clear() {
    undo.current = [];
    redo.current = [];
    scope.current = undefined;
    setSkipped(0);
    replace(empty());
  }

  function disconnect(next: Phase) {
    const bound = active.current;
    active.current = undefined;
    bound?.port.disconnect();
    setPhase(next);
  }

  function requireScope(tab: number, origin: string) {
    if (!scope.current || scope.current.tab !== tab || scope.current.origin !== origin) {
      throw Error('Continue in the original tab and origin, or start a new recording.');
    }
  }

  function start(tab: number, origin: string, documentId?: string, append = false) {
    if (append) requireScope(tab, origin);
    disconnect('connecting');
    if (!append) replace(empty(), true);
    if (!append) setSkipped(0);
    scope.current = {tab, origin};
    if (append && current.current.steps.length < workflowLimit) {
      replace({...current.current, steps: [...current.current.steps, {action: 'navigation'}]});
    }
    const port = chrome.tabs.connect(tab, {name: recordingPort, ...(documentId ? {documentId} : {frameId: 0})});
    const session = crypto.randomUUID();
    const bound = {port, session, tab, sequence: 0, stopping: false};
    active.current = bound;
    port.onMessage.addListener((event: RecordingEvent) => {
      if (active.current !== bound || event?.version !== 1 || event.session !== session) return;
      if (event.type === 'diagnostic' && event.reason === 'target-unavailable') setSkipped(previous => previous + 1);
      if (event.type === 'state') {
        if (event.state === 'recording' || event.state === 'paused') setPhase(event.state);
        else if (event.state === 'stopped' || event.state === 'limit') {
          disconnect(event.state === 'limit' || bound.stopping ? 'stopped' : 'interrupted');
          setMessage(event.state === 'limit' ? 'Recording limit reached.' :
            bound.stopping ? '' : 'Recording ended. Review or continue in the original tab.');
        }
      }
      if (event.type !== 'step' || !Number.isSafeInteger(event.sequence) || event.sequence !== bound.sequence + 1) return;
      try {
        const step = readRecordedStep(event.step);
        delete step.approved;
        delete step.parameter;
        bound.sequence = event.sequence;
        if (current.current.steps.length >= workflowLimit) {
          disconnect('stopped');
          setMessage('Recording limit reached.');
          return;
        }
        replace({...current.current, steps: [...current.current.steps, step]});
      } catch {
        disconnect('interrupted');
        setMessage('Recording stopped after receiving an invalid step.');
      }
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (active.current === bound) disconnect('interrupted');
    });
    setMessage('');
    send('start');
  }

  function send(type: RecordingCommand['type']) {
    const bound = active.current;
    if (!bound) return;
    try {
      if (type === 'stop') bound.stopping = true;
      bound.port.postMessage({version: 1, session: bound.session, type} satisfies RecordingCommand);
    } catch {
      disconnect('interrupted');
    }
  }

  useEffect(() => {
    const changed = ({tabId}: chrome.tabs.TabActiveInfo) => {
      if (active.current && active.current.tab !== tabId) disconnect('interrupted');
    };
    chrome.tabs.onActivated?.addListener(changed);
    return () => {
      chrome.tabs.onActivated?.removeListener(changed);
      active.current?.port.disconnect();
      active.current = undefined;
    };
  }, []);

  return {workflow, phase, message, skipped, setMessage, start, requireScope, send, replace, clear, moveHistory, canUndo: undo.current.length > 0,
    canRedo: redo.current.length > 0};
}

export function WorkflowControls({recorder, profile, open, ready, save, associate, validate, observationEpoch}: {
  recorder: ReturnType<typeof useWorkflow>;
  profile: GenerationProfile;
  open: (append: boolean) => void;
  ready: boolean;
  save: (name: string, data: string) => void;
  associate?: (workflow: Workflow) => Promise<void>;
  validate?: (locators: Locator[]) => Promise<RuntimeResult[]>;
  observationEpoch: number;
}) {
  const {workflow, phase, message, setMessage, send, replace} = recorder;
  const [preview, setPreview] = useState<{source: string; workflow: Workflow; profile: GenerationProfile}>();
  const [replacement, setReplacement] = useState<number>();
  const [checked, setChecked] = useState<{workflow: Workflow; epoch: number; results: Map<number, RuntimeResult>}>();
  const active = ['connecting', 'recording', 'paused'].includes(phase);
  const validPreview = preview?.workflow === workflow && preview.profile === profile ? preview.source : '';
  const change = (steps: Workflow['steps']) => replace({...workflow, steps}, true);
  const publish = (operation: () => void) => {
    try {operation(); setMessage('');}
    catch (error) {setMessage(error instanceof Error ? error.message : String(error));}
  };

  return <details>
    <summary>Record workflow</summary>
    <p>Recording uses the active tab and accessible same-origin frames. Input and selection values are parameters.</p>
    <p role="status">Workflow {phase}{message && ' · ' + message}</p>
    <div className="actions">
      {!active && <button disabled={!ready} onClick={() => open(false)}>Start recording</button>}
      {phase === 'interrupted' && <button disabled={!ready} onClick={() => open(true)}>Continue original recording</button>}
      {phase === 'recording' && <button onClick={() => send('pause')}>Pause recording</button>}
      {phase === 'paused' && <button onClick={() => send('resume')}>Resume recording</button>}
      {active && <button onClick={() => send('stop')}>Stop recording</button>}
      {phase === 'recording' && <button onClick={() => send('assert')}>Assert last target is visible</button>}
    </div>
    <p>{workflow.steps.length} steps</p>
    <p>Review layout-dependent targets before generating Python.</p>
    {recorder.skipped > 0 && <p>{recorder.skipped} actions had unresolved targets.</p>}
    {workflow.steps.some(step => step.action === 'navigation') &&
      <p>Navigation markers appear in JSON. Python follows the preceding application action.</p>}
    <fieldset disabled={active}>
      <legend>Workflow review</legend>
      <label>Workflow name <input value={workflow.name} onChange={event => replace({...workflow, name: event.target.value}, true)}/></label>
      <label>Workflow description <input maxLength={300} value={workflow.description ?? ''}
        onChange={event => replace({...workflow, description: event.target.value || undefined}, true)}/></label>
      <button disabled={!recorder.canUndo} onClick={() => recorder.moveHistory(true)}>Undo workflow edit</button>
      <button disabled={!recorder.canRedo} onClick={() => recorder.moveHistory(false)}>Redo workflow edit</button>
      <ol>{workflow.steps.map((step, index) => <li key={index}>
        <strong>{step.action}{step.tag && ' · ' + step.tag}{step.key && ' · ' + step.key}</strong>
        {step.locator && <details><summary>Target selector</summary><code>{pythonLocator(step.locator)}</code></details>}
        {step.locator && checked?.workflow === workflow && checked.epoch === observationEpoch && checked.results.has(index) &&
          <p>Playwright {checked.results.get(index)!.status} · Target identity unconfirmed</p>}
        {step.locator && step.action !== 'download' && <label><input type="checkbox" checked={!!step.approved}
          onChange={event => change(workflow.steps.map((item, position) => position === index ?
            {...item, approved: event.target.checked} : item))}/> Approve recorded target for step {index + 1}</label>}
        {['fill', 'select', 'upload'].includes(step.action) && <label>Parameter for step {index + 1}
          <input placeholder={'value_' + (index + 1)} value={step.parameter ?? ''} onChange={event =>
            change(workflow.steps.map((item, position) => position === index ?
              {...item, parameter: event.target.value || undefined} : item))}/></label>}
        <button disabled={index === 0} onClick={() => {
          const steps = [...workflow.steps];
          [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
          change(steps);
        }}>Move step {index + 1} up</button>
        <button disabled={workflow.steps.length >= workflowLimit} onClick={() =>
          change([...workflow.steps.slice(0, index + 1), {...step, approved: false}, ...workflow.steps.slice(index + 1)])
        }>Duplicate step {index + 1}</button>
        {step.locator && <button disabled={workflow.steps.length >= workflowLimit} onClick={() =>
          change([...workflow.steps.slice(0, index + 1), {action: 'assert', locator: step.locator, tag: step.tag},
            ...workflow.steps.slice(index + 1)])
        }>Insert visibility assertion after step {index + 1}</button>}
        <button onClick={() => change(workflow.steps.filter((_, position) => position !== index))}>Remove step {index + 1}</button>
        {step.action === 'fill' && <button onClick={() => change(workflow.steps.map((item, position) => position === index ?
          {...item, action: 'clear', parameter: undefined, approved: false} : item))}>Change step {index + 1} to clear</button>}
        {step.locator && <button onClick={() => setReplacement(replacement === index ? undefined : index)}>
          {replacement === index ? 'Cancel target replacement' : `Replace target for step ${index + 1}`}
        </button>}
        {step.locator && replacement === index && <label>Recorded replacement target
          <select value="" onChange={event => {
            if (!event.target.value) return;
            const target = workflow.steps[Number(event.target.value)];
            if (target?.locator) change(workflow.steps.map((item, position) => position === index ?
              {...item, locator: target.locator, tag: target.tag, approved: false} : item));
            setReplacement(undefined);
          }}>
            <option value="">Choose a recorded step</option>
            {workflow.steps.map((target, position) => target.locator && index !== position &&
              <option key={position} value={position}>Step {position + 1} · {target.tag}</option>)}
          </select>
        </label>}
      </li>)}</ol>
      <button disabled={!workflow.steps.length} onClick={() => publish(() =>
        setPreview({workflow, profile, source: generate(workflowModel(workflow), 'browser', profile)}))}>Preview workflow Python</button>
      {associate && <button disabled={!workflow.steps.length} onClick={async () => {
        try {await associate(workflow); setMessage('Workflow method added to the scanned page object.');}
        catch (error) {setMessage(error instanceof Error ? error.message : String(error));}
      }}>Add workflow method to scanned page</button>}
      {validate && <button disabled={!workflow.steps.length} onClick={async () => {
        try {
          const targets = readWorkflow(workflow).steps.flatMap((step, index) => step.locator ? [{index, locator: step.locator}] : []);
          if (!targets.length || targets.length > 40) throw Error('Check a workflow with 1 to 40 targets against the scanned page.');
          const results = await validate(targets.map(target => target.locator));
          setChecked({workflow, epoch: observationEpoch, results: new Map(targets.map((target, index) => [target.index, results[index]]))});
          setMessage('Playwright checked the workflow against the current page.');
        } catch (error) {setMessage(error instanceof Error ? error.message : String(error));}
      }}>Validate workflow with Playwright</button>}
      {validPreview && <>
        <textarea aria-label="Workflow Python preview" value={validPreview} readOnly/>
        <button onClick={() => save('recorded_workflow.py', validPreview)}>Export workflow Python</button>
      </>}
      <button onClick={() => publish(() => save('workflow.json', JSON.stringify(readWorkflow(workflow), null, 2)))}>Export workflow JSON</button>
      <label>Import workflow JSON <input type="file" accept=".json" onChange={async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          if (file.size > 512000) throw Error('Use a workflow file under 512 KB.');
          const imported = readWorkflow(JSON.parse(await file.text()));
          replace({...imported, steps: imported.steps.map(step => ({...step, approved: false}))}, true);
          setMessage('Workflow imported. Review targets before generating.');
        } catch (error) {setMessage(error instanceof Error ? error.message : String(error));}
      }}/></label>
      <button onClick={() => publish(() => {
        void chrome.storage.local.set({[draftKey]: readWorkflow(workflow)})
          .then(() => setMessage('Workflow draft saved locally.')).catch(() => setMessage('Draft could not be saved.'));
      })}>Save workflow draft</button>
      <button onClick={async () => {
        try {
          const result = await chrome.storage.local.get(draftKey);
          if (!result[draftKey]) throw Error('There is no saved workflow draft.');
          const saved = readWorkflow(result[draftKey]);
          replace({...saved, steps: saved.steps.map(step => ({...step, approved: false}))}, true);
          setMessage('Saved workflow recovered.');
        } catch (error) {setMessage(error instanceof Error ? error.message : String(error));}
      }}>Recover workflow draft</button>
      <button onClick={async () => {
        try {
          await chrome.storage.local.remove(draftKey);
          recorder.clear();
          setMessage('Workflow and saved draft cleared.');
        } catch {setMessage('Saved draft could not be cleared.');}
      }}>Clear workflow and draft</button>
    </fieldset>
  </details>;
}
