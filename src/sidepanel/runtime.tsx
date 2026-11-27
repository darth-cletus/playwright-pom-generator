import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {locatorKey, type Candidate} from '../core/locator';
import {archiveValidation, type ElementModel, type PageModel} from '../core/model';
import {evidenceLifetime, type CompanionStatus, type Correlation, type RuntimeEvidence, type RuntimePolicy, type Trial} from '../core/runtime';
import {readResults, readStatus, request, type Pairing} from './runtime-client';

export type RuntimeJob = {
  element: ElementModel;
  candidates: Candidate[];
  scopeId?: string;
  apply?: (model: PageModel, evidence: RuntimeEvidence[]) => PageModel;
};
type Batch = {controller: AbortController; requestId?: string};

export function useRuntime(model: PageModel | null, setModel: Dispatch<SetStateAction<PageModel | null>>,
  tab: number | null, testIdAttribute?: string) {
  const [port, setPort] = useState('8765');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<CompanionStatus>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState<Trial>('none');
  const [states, setStates] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState(true);
  const [policy, setPolicy] = useState<RuntimePolicy>('browser');
  const pairing = useRef<Pairing | undefined>(undefined);
  const batch = useRef<Batch | undefined>(undefined);
  const hasEvidence = !!model?.elements.some(element =>
    element.candidates.some(candidate => candidate.runtime?.freshness === 'current')) ||
    !!model?.components?.some(definition => definition.runtime?.some(report => report.evidence.freshness === 'current'));

  function cancel() {
    const active = batch.current;
    if (!active) return;
    active.controller.abort();
    if (pairing.current && active.requestId) {
      void request(pairing.current, 'cancel', {requestId: active.requestId}).catch(() => {});
    }
  }

  function invalidate() {
    cancel();
    setModel(archiveValidation);
  }

  useEffect(() => {
    invalidate();
  }, [tab, model?.documentKey, testIdAttribute]);

  useEffect(() => () => cancel(), []);

  useEffect(() => {
    if (!hasEvidence || !status?.browserId) return;
    let disposed = false;
    const timer = window.setInterval(async () => {
      const config = pairing.current;
      if (!config || batch.current) return;
      try {
        const check = readStatus(await request(config, 'status', {}, AbortSignal.timeout(2500)));
        if (disposed || check.browserId === status.browserId) return;
        invalidate();
        setStatus(check);
        setMessage('The browser session changed. Reconnect before validating again.');
      } catch {
        if (disposed) return;
        invalidate();
        setStatus(undefined);
        setMessage('The companion connection was lost. Pair again to continue.');
      }
    }, 8000);
    return () => {disposed = true; clearInterval(timer);};
  }, [hasEvidence, status?.browserId]);

  useEffect(() => {
    function changed(value: unknown, sender: chrome.runtime.MessageSender) {
      const message = value as {type?: string; documentKey?: string} | null;
      if (message?.type === 'POM_RUNTIME_CHANGED' && sender.id === chrome.runtime.id && sender.tab?.id === tab &&
        message.documentKey === model?.documentKey) {
        invalidate();
      }
    }
    function updated(tabId: number, change: chrome.tabs.TabChangeInfo) {
      if (tabId === tab && (change.status === 'loading' || change.url !== undefined)) invalidate();
    }
    function activated(info: chrome.tabs.TabActiveInfo) {
      if (tab !== null && tab !== info.tabId) invalidate();
    }
    chrome.runtime.onMessage?.addListener(changed);
    chrome.tabs.onUpdated?.addListener(updated);
    chrome.tabs.onActivated?.addListener(activated);
    return () => {
      chrome.runtime.onMessage?.removeListener(changed);
      chrome.tabs.onUpdated?.removeListener(updated);
      chrome.tabs.onActivated?.removeListener(activated);
    };
  }, [tab, model?.documentKey]);

  useEffect(() => {
    const next = model?.elements.flatMap(element => element.candidates.flatMap(candidate =>
      candidate.runtime?.freshness === 'current' ? [candidate.runtime.expiresAt] : [])) ?? [];
    next.push(...(model?.components?.flatMap(definition => definition.runtime?.flatMap(report =>
      report.evidence.freshness === 'current' ? [report.evidence.expiresAt] : []) ?? []) ?? []));
    if (!next.length) return;
    const timer = window.setTimeout(() => {
      setModel(current => current && ({
        ...current, components: current.components?.map(definition => ({
          ...definition, runtime: definition.runtime?.map(report => report.evidence.freshness === 'current' &&
            report.evidence.expiresAt <= Date.now() ? {...report, evidence: {...report.evidence, freshness: 'historical'}} : report),
        })), elements: current.elements.map(element => ({
          ...element, candidates: element.candidates.map(candidate =>
            candidate.runtime?.freshness === 'current' && candidate.runtime.expiresAt <= Date.now()
              ? {...candidate, runtime: {...candidate.runtime, freshness: 'historical'}} : candidate),
        })),
      }));
    }, Math.max(0, Math.min(...next) - Date.now()));
    return () => clearTimeout(timer);
  }, [model]);

  async function connection(operation: 'status' | 'connect' | 'disconnect', explicit = false) {
    setBusy(true);
    try {
      let config = pairing.current;
      if (explicit) {
        const numericPort = Number(port);
        if (!/^\d{4,5}$/.test(port) || numericPort < 1024 || numericPort > 65535 ||
          !/^[a-zA-Z0-9_-]{43}$/.test(token.trim())) throw Error('Enter a valid loopback port and pairing token.');
        const allowed = await chrome.permissions.request({origins: ['http://127.0.0.1/*']});
        if (!allowed) throw Error('Loopback access was declined.');
        config = {port: numericPort, token: token.trim()};
      }
      if (!config) throw Error('Pair with the companion first.');
      const next = readStatus(await request(config, operation));
      if (explicit) {
        pairing.current = config;
        setToken('');
      }
      if (next.browserId !== status?.browserId) invalidate();
      setStatus(next);
      setMessage(next.connected ? 'Browser connected. Scan or pick elements to validate the inspected document.' :
        'Companion paired. Connect to the configured Chromium debugging profile.');
    } catch (error) {
      invalidate();
      setStatus(undefined);
      setMessage(error instanceof Error ? error.message : 'Companion unavailable.');
    } finally {
      setBusy(false);
    }
  }

  async function validate(jobs: RuntimeJob[]) {
    const documentKey = model?.documentKey;
    const browserId = status?.browserId;
    const config = pairing.current;
    if (tab === null || !documentKey || !browserId || !config || !testIdAttribute || batch.current || !jobs.length) return;
    const active: Batch = {controller: new AbortController()};
    batch.current = active;
    const signal = active.controller.signal;
    setBusy(true);
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const job of jobs) {
        if (signal.aborted) break;
        setMessage(`Validating ${completed + 1} of ${jobs.length} element(s)…`);
        let marker: Correlation | undefined;
        try {
          if (job.element.stale) throw Error('The selected element is detached.');
          const [current] = await chrome.tabs.query({active: true, currentWindow: true});
          if (current?.id !== tab) throw Error('Switch to the inspected tab before validating.');
          marker = await chrome.tabs.sendMessage(tab, {
            type: 'POM_RUNTIME_MARK', documentKey, referenceId: confirmTarget ? job.element.referenceId : undefined,
            scopeId: job.scopeId,
          }, {frameId: 0}) ?? undefined;
          if (!marker) throw Error('The document or element is no longer available. Scan or inspect it again.');
          if (signal.aborted) break;
          const requestId = crypto.randomUUID();
          active.requestId = requestId;
          const candidates = job.candidates;
          const data = await request(config, 'validate', {requestId, browserId, documentKey,
            correlation: marker, states, trial, locators: candidates.map(candidate => candidate.locator)}, signal);
          const results = readResults(data, {requestId, browserId, documentKey,
            strategies: candidates.map(candidate => candidate.locator.strategy)});
          const resultMarker = marker;
          const unchanged = await chrome.tabs.sendMessage(tab, {
            type: 'POM_RUNTIME_RELEASE', attribute: resultMarker.attribute,
          }, {frameId: 0});
          marker = undefined;
          if (signal.aborted) break;
          if (unchanged !== true) throw Error('The document or element changed during validation. Retry on the intended target.');
          setModel(latest => {
            if (signal.aborted || latest?.documentKey !== documentKey) return latest;
            const evidence = candidates.map((candidate, index): RuntimeEvidence => ({
              ...results[index], requestId, browserId, documentKey,
              candidateId: candidate.id, elementId: job.element.id,
              testIdAttribute: candidate.locator.strategy === 'test-id' ? candidate.locator.attribute : testIdAttribute,
              expiresAt: Date.now() + evidenceLifetime, freshness: 'current',
            }));
            if (job.apply) return job.apply(latest, evidence);
            return {...latest, elements: latest.elements.map(element => {
              if (element.id !== job.element.id || element.referenceId !== job.element.referenceId || element.stale) return element;
              return {...element, candidates: element.candidates.map(candidate => {
                const index = candidates.findIndex(prior => prior.id === candidate.id &&
                  locatorKey(prior.locator) === locatorKey(candidate.locator));
                if (index < 0) return candidate;
                return {...candidate, runtime: evidence[index]};
              })};
            })};
          });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'Validation failed.');
        } finally {
          active.requestId = undefined;
          if (marker) await chrome.tabs.sendMessage(tab, {
            type: 'POM_RUNTIME_RELEASE', attribute: marker.attribute,
          }, {frameId: 0}).catch(() => {});
        }
        completed++;
      }
      setMessage(signal.aborted ? 'Validation cancelled or invalidated by a page change.' : failures.length
        ? `Completed ${completed - failures.length} of ${jobs.length} element(s). ${failures[0]}`
        : `Validated ${completed} element(s) with Python Playwright.`);
    } finally {
      batch.current = undefined;
      setBusy(false);
    }
  }

  return {port, setPort, token, setToken, status, message, busy, validating: !!batch.current,
    trial, setTrial, states, setStates, confirmTarget, setConfirmTarget,
    policy, setPolicy, validate, connection, cancel, invalidate};
}

export function RuntimeControls({runtime, extensionId}: {runtime: ReturnType<typeof useRuntime>; extensionId: string}) {
  return <><details>
    <summary>Playwright runtime validation</summary>
    <small>Extension ID {extensionId}</small>
    <form onSubmit={event => {event.preventDefault(); void runtime.connection('status', true);}}>
      <label>Companion loopback port <input value={runtime.port} inputMode="numeric" onChange={event => runtime.setPort(event.target.value)}/></label>
      <label>Pairing token <input type="password" autoComplete="off" value={runtime.token}
        onChange={event => runtime.setToken(event.target.value)}/></label>
      <button disabled={runtime.busy}>Pair with companion</button>
    </form>
    <div className="actions">
      <button disabled={runtime.busy || !runtime.status} onClick={() => void runtime.connection('connect')}>Connect browser</button>
      <button disabled={runtime.busy || !runtime.status?.connected} onClick={() => void runtime.connection('disconnect')}>Disconnect browser</button>
      <button disabled={runtime.busy || !runtime.status} onClick={() => void runtime.connection('status')}>Refresh connection</button>
    </div>
    {runtime.status && <small>Companion {runtime.status.serviceVersion} · Python {runtime.status.pythonVersion} · Playwright {runtime.status.playwrightVersion}
      {runtime.status.browserVersion && ` · Chromium ${runtime.status.browserVersion}`}</small>}
    <label><input type="checkbox" checked={runtime.states} onChange={event => runtime.setStates(event.target.checked)}/> Read element states</label>
    <label><input type="checkbox" checked={runtime.confirmTarget} onChange={event => runtime.setConfirmTarget(event.target.checked)}/> Verify intended element</label>
    <label>Trial action
      <select value={runtime.trial} onChange={event => runtime.setTrial(event.target.value as Trial)}>
        <option value="none">None</option>
        {['click', 'hover', 'check', 'fill', 'select'].map(action => <option key={action}>{action}</option>)}
      </select>
    </label>
    {runtime.trial !== 'none' && <small>Trials may scroll the page. Fill and select trials are unsupported.</small>}
    <label>Python export policy
      <select value={runtime.policy} onChange={event => runtime.setPolicy(event.target.value as RuntimePolicy)}>
        <option value="browser">Browser safeguards with runtime evidence</option>
        <option value="runtime">Require fresh unique Playwright result</option>
        <option value="confirmed">Require confirmed Playwright target</option>
      </select>
    </label>
  </details>
    {runtime.message && <small role="status">{runtime.message}</small>}
    {runtime.validating && <button onClick={runtime.cancel}>Cancel validation</button>}
  </>;
}
