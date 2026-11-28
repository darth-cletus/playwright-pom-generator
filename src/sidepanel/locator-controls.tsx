import {useId, useState} from 'react';
import {parseSettings, recommendedCandidate, selectedCandidate, type Candidate, type LocatorSettings} from '../core/locator';
import type {ElementModel} from '../core/model';
import {pythonLocator} from '../core/python';
import {currentEvidence, runtimeRejects} from '../core/runtime';

export function Settings({settings, onSave}: {settings: LocatorSettings; onSave: (settings: LocatorSettings) => Promise<void>}) {
  const [attributes, setAttributes] = useState(settings.testAttributes.join(', '));
  const [playwright, setPlaywright] = useState(settings.playwrightTestAttribute);
  const [status, setStatus] = useState('');
  return <details>
    <summary>Locator settings</summary>
    <form onSubmit={async event => {
      event.preventDefault();
      try {
        await onSave(parseSettings(attributes, playwright));
        setStatus('Settings saved. Scan again to apply them.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }}>
      <label>Recognized test ID attributes in priority order
        <input type="text" value={attributes} onChange={event => setAttributes(event.target.value)}/>
      </label>
      <label>Test ID attribute configured in your Playwright project
        <input type="text" value={playwright} onChange={event => setPlaywright(event.target.value)} required/>
      </label>
      <button type="submit">Save locator settings</button>
      <small role="status">{status}</small>
    </form>
  </details>;
}

const validationMethods = {
  'dom-css': 'Exact DOM CSS match',
  'semantic-approximation': 'Browser approximation',
  playwright: 'Playwright runtime',
  none: 'Unvalidated',
};

const validationStatuses = {
  'unique-target': 'Unique target',
  ambiguous: 'Ambiguous',
  'no-match': 'No match',
  'wrong-target': 'Wrong target',
  unvalidated: 'Unvalidated',
  error: 'Validation error',
};

export function LocatorControls({element, onChoice, onValidate}: {
  element: ElementModel; onChoice: (choice: string | null) => void; onValidate?: (candidates: Candidate[]) => void;
}) {
  const id = useId();
  const recommended = recommendedCandidate(element.candidates);
  const active = selectedCandidate(element);
  return <>
    <label htmlFor={id}>Locator</label>
    <select id={id} value={element.choice ?? ''} onChange={event => onChoice(event.target.value || null)}>
      <option value="">Automatic{recommended ? ` · ${recommended.basis}` : ' · No unique candidate'}</option>
      {element.choice && !active && <option value={element.choice}>Previous choice unavailable · select a locator</option>}
      {element.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
        {candidate.basis} · {candidate.locator.strategy} · {candidate.score}/100 · {validationStatuses[candidate.validation.status]}
        {currentEvidence(candidate.runtime) && ` · Playwright: ${candidate.runtime?.status}`}
      </option>)}
    </select>
    {onValidate && <div className="actions">
      {active && <button onClick={() => onValidate([active])}>Validate current locator</button>}
      <button onClick={() => onValidate(element.candidates)}>Validate all candidates</button>
    </div>}
    {!recommended && <small>No unique locator. Inspect a more specific target or add a stable test ID.</small>}
    {active && <>
      <small><code>{pythonLocator(active.locator)}</code></small>
      <small>{active.locator.strategy} · {active.score}/100 · {validationStatuses[active.validation.status]}
        {' · '}{active.validation.count ?? 'Unknown'} matches · {validationMethods[active.validation.method]}</small>
      {active.priorCount !== undefined && <small>Previously matched {active.priorCount}.</small>}
      {active.runtime && <div>
        <small>Playwright runtime · {currentEvidence(active.runtime) ? 'Current' : 'Historical'} · {active.runtime.status}
          {' · '}{active.runtime.count ?? 'Unknown'} matches · identity {active.runtime.identity}</small>
        <small>{active.runtime.timestamp} · {active.runtime.durationMs} ms</small>
        {active.runtime.states && <small>{Object.entries(active.runtime.states).map(([name, state]) =>
          `${name}: ${state === null ? 'unavailable' : state}`).join(' · ')}</small>}
        {active.runtime.actionability && <small>{active.runtime.actionability.action} trial · {active.runtime.actionability.status}</small>}
        {active.runtime.message && <small>{active.runtime.message}</small>}
        {active.runtime.stateError && <small>{active.runtime.stateError}</small>}
        {runtimeRejects(active.runtime) && <small className="error">Choose a different locator or validate again.</small>}
      </div>}
      <details>
        <summary>Locator details</summary>
        <ul>{[...active.explanations, ...active.warnings].map(line => <li key={line}>{line}</li>)}</ul>
        {active.runtime && <small>Request {active.runtime.requestId} · candidate {active.runtime.candidateId}</small>}
      </details>
    </>}
  </>;
}
