import {useEffect, useRef, useState} from 'react';
import {inspectorPort, type Direction, type InspectorCommand, type InspectorEvent,
  type InspectorState, type Mode} from '../core/inspector';
import type {LocatorSettings} from '../core/locator';
import type {PageModel} from '../core/model';
import {LocatorControls} from './locator-controls';

interface Connection {
  port: chrome.runtime.Port;
  tab: number;
  window?: number;
  documentKey?: string;
}

export function useInspector(model: PageModel | null,
  onSelected: (page: PageModel, tab: number) => void, onStale: (ids: string[]) => void) {
  const [state, setState] = useState<InspectorState>('inactive');
  const [target, setTarget] = useState<Extract<InspectorEvent, {type: 'target'}>>();
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<Mode>('semantic');
  const connection = useRef<Connection | null>(null);
  const callbacks = useRef({onSelected, onStale});
  callbacks.current = {onSelected, onStale};

  function end(message: string, next: InspectorState = 'inactive') {
    const current = connection.current;
    connection.current = null;
    current?.port.disconnect();
    setTarget(undefined);
    setState(next);
    setStatus(message);
  }

  useEffect(() => {
    function activated(info: chrome.tabs.TabActiveInfo) {
      const current = connection.current;
      if (current && current.window === info.windowId && current.tab !== info.tabId) end('Inspection stopped after switching tabs.');
    }
    function updated(tabId: number, change: chrome.tabs.TabChangeInfo) {
      if (connection.current?.tab === tabId && change.status === 'loading') end('Page navigation stopped inspection.');
    }
    function escape(event: KeyboardEvent) {
      if (!connection.current || event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.isComposing) return;
      event.preventDefault();
      stop();
    }
    chrome.tabs.onActivated?.addListener(activated);
    chrome.tabs.onUpdated?.addListener(updated);
    window.addEventListener('keydown', escape);
    return () => {
      chrome.tabs.onActivated?.removeListener(activated);
      chrome.tabs.onUpdated?.removeListener(updated);
      window.removeEventListener('keydown', escape);
      const current = connection.current;
      connection.current = null;
      current?.port.disconnect();
    };
  }, []);

  function send(command: InspectorCommand) {
    try {
      connection.current?.port.postMessage(command);
    } catch {
      end('Content script unavailable. Start inspection again.', 'error');
    }
  }

  useEffect(() => {
    if (state !== 'active' || !model || connection.current?.documentKey !== model.documentKey) return;
    const ids = (selected: boolean) => model.elements.flatMap(element =>
      element.referenceId && !element.stale && (!selected || element.selected) ? [element.referenceId] : []);
    send({type: 'track', ids: ids(false), selected: ids(true)});
  }, [state, model]);

  function start(tab: number, window: number | undefined, settings: LocatorSettings, documentId?: string) {
    if (connection.current) return;
    setState('starting');
    setStatus('Starting inspector…');
    const port = chrome.tabs.connect(tab, documentId ? {name: inspectorPort, documentId} : {name: inspectorPort, frameId: 0});
    const current: Connection = {port, tab, window};
    connection.current = current;
    port.onMessage.addListener((message: InspectorEvent) => {
      if (connection.current !== current) return;
      switch (message?.type) {
        case 'active':
          if (current.documentKey || typeof message.documentKey !== 'string') return;
          current.documentKey = message.documentKey;
          setState('active');
          setStatus('Inspector active. Hover over the page.');
          break;
        case 'target':
          if (!current.documentKey || (message.details && (typeof message.details.id !== 'string' ||
            !message.details.id.startsWith(current.documentKey + ':')))) return;
          setTarget(message);
          break;
        case 'selected':
          if (current.documentKey && message.page?.documentKey === current.documentKey && Array.isArray(message.page.elements) &&
            message.page.elements.every(element => typeof element.id === 'string' &&
              typeof element.referenceId === 'string' && element.referenceId.startsWith(current.documentKey + ':'))) {
            callbacks.current.onSelected(message.page, current.tab);
          }
          break;
        case 'stale':
          if (current.documentKey && Array.isArray(message.ids)) callbacks.current.onStale(
            message.ids.filter(id => typeof id === 'string' && id.startsWith(current.documentKey + ':')));
          break;
        case 'stopped': end(message.reason); break;
        case 'error': end(message.message, 'error'); break;
      }
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (connection.current === current) end(error?.message ?
        'Content script unavailable. Start inspection again.' : 'Inspector disconnected.');
    });
    send({type: 'start', settings, mode});
  }

  function stop() {
    setState('stopping');
    send({type: 'stop'});
    end('Inspection stopped.');
  }

  function changeMode(next: Mode) {
    setMode(next);
    send({type: 'mode', mode: next});
  }

  return {state, target, status, mode, start, stop, send, changeMode};
}

export function InspectorControls({inspector, ready, start}: {
  inspector: ReturnType<typeof useInspector>; ready: boolean; start: () => void;
}) {
  const {state, target, status, mode, stop, send, changeMode} = inspector;
  const active = state === 'active';
  const details = target?.details;
  const [child, setChild] = useState(0);
  const directions: [Direction, string][] = [['parent', 'Parent'], ['previous', 'Previous sibling'],
    ['next', 'Next sibling'], ['original', 'Original target']];
  return <section aria-label="Element inspector">
    <div className="actions">
      {active || state === 'starting' ?
        <button onClick={stop}>Stop inspection</button> :
        <button disabled={!ready} onClick={start}>Start inspection</button>}
      <label>Target mode
        <select value={mode} onChange={event => changeMode(event.target.value === 'exact' ? 'exact' : 'semantic')}>
          <option value="semantic">Semantic</option><option value="exact">Exact element</option>
        </select>
      </label>
    </div>
    <small role="status">{status || 'Inspector inactive.'}</small>
    {active && <button onClick={() => send({type: 'clear'})}>Clear target</button>}
    {active && details && <article>
      <strong>{details.tag}{details.role ? ' · ' + details.role : ''}{details.name ? ' · ' + details.name : ''}</strong>
      <small>{details.hierarchy.join(' › ')}</small>
      <div className="actions">
        {directions.map(([direction, label]) => <button key={direction} onClick={() => send({type: 'navigate', direction})}>{label}</button>)}
      </div>
      {!!target.children?.length && <div className="actions">
        <select aria-label="Child element" value={Math.min(child, target.children.length - 1)} onChange={event => setChild(Number(event.target.value))}>
          {target.children.map((label, index) => <option key={index} value={index}>{label}</option>)}
        </select>
        <button onClick={() => send({type: 'navigate', direction: 'child', child: Math.min(child, target.children!.length - 1)})}>Inspect child</button>
      </div>}
      <button onClick={() => send({type: 'select'})}>Add target</button>
      <details key={details.id}>
        <summary>Element metadata</summary>
        <dl>
          {Object.entries({
            'Explicit role': details.explicitRole, 'Implicit role': details.implicitRole,
            Labels: details.labels.join(', '), Visibility: details.visible ? 'Visible' : 'Hidden',
            State: [details.disabled ? 'Disabled' : 'Enabled', details.readOnly ? 'Read-only' : '',
              details.focusable ? 'Focusable' : 'Not focusable'].filter(Boolean).join(', '),
            Bounds: `${Math.round(details.rect.width)} × ${Math.round(details.rect.height)} at ${Math.round(details.rect.x)}, ${Math.round(details.rect.y)}`,
            Interaction: details.action === 'assert' ? 'Assertion locator' : details.action,
            ...details.attributes,
          }).map(([key, value]) => value ? <div key={key}><dt>{key}</dt><dd>{value}</dd></div> : null)}
        </dl>
      </details>
      {target.element && <details>
        <summary>Target locators</summary>
        <PreviewLocators key={details.id} element={target.element}/>
      </details>}
    </article>}
  </section>;
}

function PreviewLocators({element}: {element: NonNullable<Extract<InspectorEvent, {type: 'target'}>['element']>}) {
  const [choice, setChoice] = useState<string | null>(null);
  return <LocatorControls element={{...element, choice}} onChoice={setChoice}/>;
}
