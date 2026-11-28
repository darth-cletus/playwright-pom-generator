import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {defaultSettings, parseSettings, selectedCandidate, type LocatorSettings} from '../core/locator';
import {mergePage, serializePage, type ElementModel, type PageModel} from '../core/model';
import {generate, generatePackage} from '../core/python';
import {pythonPackageZip} from '../core/python-package';
import {LocatorControls, Settings} from './locator-controls';
import {InspectorControls, useInspector} from './inspector';
import {RuntimeControls, useRuntime} from './runtime';
import {ComponentsPanel} from './components';
import {useLive} from './live';
import {contextLabel, type ContextBoundary} from '../core/context';
import {scanAuthorizedFrames, scopeEmbeddedRow, type FrameScan} from './frames';
import {Review} from './review';

const settingsKey = 'locatorSettings';
type PageIntent = 'scan' | 'inspect' | 'live';
type SiteAccess = {site: string; intent: PageIntent; tab: number};

function App() {
  const [model, setModel] = useState<PageModel | null>(null);
  const [tab, setTab] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [siteAccess, setSiteAccess] = useState<SiteAccess | null>(null);
  const [settings, setSettings] = useState<LocatorSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [pick, setPick] = useState<{id: string; duplicate: boolean}>();
  const [file, setFile] = useState('');
  const [embedded, setEmbedded] = useState<FrameScan[]>([]);
  const [embeddedMessage, setEmbeddedMessage] = useState('');
  const [contextFilter, setContextFilter] = useState('');
  const embeddedInspection = useRef<FrameScan | undefined>(undefined);
  const runtime = useRuntime(model, setModel, tab, settings?.playwrightTestAttribute, embedded);
  const live = useLive(model, setModel, runtime.invalidate);
  const [autoValidate, setAutoValidate] = useState(false);
  const latestValidation = useRef({model, validate: runtime.validate, busy: runtime.busy});
  latestValidation.current = {model, validate: runtime.validate, busy: runtime.busy};
  const lastAutomatic = useRef(0);
  useEffect(() => {
    const update = live.update;
    if (!autoValidate || !runtime.status?.connected || live.phase !== 'live' || !update || update.full) return;
    const changed = new Set(update.upserts.map(row => row.referenceId));
    if (!changed.size) return;
    const timer = window.setTimeout(() => {
      const current = latestValidation.current;
      if (current.busy || current.model?.documentKey !== update.context.documentKey) return;
      const jobs = current.model.elements.flatMap(element => {
        if (element.stale || element.context?.external || !element.selected || !changed.has(element.referenceId)) return [];
        const candidate = selectedCandidate(element);
        return candidate ? [{element, candidates: [candidate]}] : [];
      }).slice(0, 5);
      if (!jobs.length) return;
      lastAutomatic.current = Date.now();
      void current.validate(jobs, 'none');
    }, Math.max(450, lastAutomatic.current + 2000 - Date.now()));
    return () => clearTimeout(timer);
  }, [autoValidate, live.phase, live.update, runtime.status?.connected]);
  const selectedRow = useRef<HTMLElement>(null);
  const inspector = useInspector(model, (incoming, sourceTab) => {
    const frame = embeddedInspection.current;
    if (frame && model && sourceTab === tab) {
      const rows = incoming.elements.map(row => ({...scopeEmbeddedRow(row, frame.context), selected: true}));
      setEmbedded(items => items.map(item => item.documentId === frame.documentId ?
        {...item, rows: [...new Map([...item.rows, ...rows].map(row => [row.id, row])).values()]} : item));
      incoming = {...incoming, elements: rows, documentKey: model.documentKey, url: model.url};
    }
    const id = incoming.elements[0]?.id;
    if (!id) return;
    setTab(sourceTab);
    setPick({id, duplicate: model?.documentKey === incoming.documentKey &&
      Boolean(model?.elements.some(element => element.id === id))});
    setModel(current => mergePage(current, incoming));
  }, ids => setModel(current => current && ({
    ...current, elements: current.elements.map(element => element.referenceId && ids.includes(element.referenceId) ?
      {...element, stale: true} : element),
  })));

  useEffect(() => {
    selectedRow.current?.scrollIntoView({block: 'nearest'});
  }, [pick]);

  useEffect(() => {
    function invalidate(tabId: number, change: chrome.tabs.TabChangeInfo) {
      if (tabId === tab && change.status === 'loading') setModel(current => current && ({
        ...current, elements: current.elements.map(element => ({...element, stale: true})),
        components: current.components?.map(definition => ({
          ...definition, instances: definition.instances.map(instance => ({...instance, root: {...instance.root, stale: true}})),
        })),
      }));
    }
    chrome.tabs.onUpdated?.addListener(invalidate);
    return () => chrome.tabs.onUpdated?.removeListener(invalidate);
  }, [tab]);

  useEffect(() => {
    const navigation = chrome.webNavigation?.onCommitted;
    if (!embedded.length || !navigation) return;
    const changed = (event: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
      if (event.tabId !== tab) return;
      const replaced = embedded.filter(frame => event.frameId === 0 ||
        (event.frameId === frame.frameId && event.documentId !== frame.documentId));
      if (!replaced.length) return;
      runtime.invalidate();
      const old = new Set(replaced.flatMap(frame => frame.rows.map(row => row.id)));
      setEmbedded(items => items.filter(frame => !replaced.includes(frame)));
      setModel(current => current && {...current, elements: current.elements.map(row =>
        old.has(row.id) ? {...row, stale: true} : row)});
    };
    const revoked = (permissions: chrome.permissions.Permissions) => {
      if (!permissions.origins?.length && !permissions.permissions?.includes('webNavigation')) return;
      inspector.stop();
      runtime.invalidate();
      setEmbedded([]);
      setModel(current => current && {...current, elements: current.elements.map(row =>
        row.context?.external ? {...row, stale: true} : row)});
    };
    navigation.addListener(changed);
    chrome.permissions.onRemoved.addListener(revoked);
    return () => {
      navigation.removeListener(changed);
      chrome.permissions.onRemoved.removeListener(revoked);
    };
  }, [embedded, tab]);
  useEffect(() => {
    chrome.storage.local.get(settingsKey).then(stored => {
      const data = stored[settingsKey];
      setSettings(data ? parseSettings(data.testAttributes.join(','), data.playwrightTestAttribute) : defaultSettings);
    }).catch(() => {
      setSettings(defaultSettings);
      setError('Saved locator settings could not be loaded.');
    });
  }, []);

  async function saveSettings(next: LocatorSettings) {
    await chrome.storage.local.set({[settingsKey]: next});
    runtime.invalidate();
    live.stop();
    setSettings(next);
  }

  let code = '';
  let generationError = '';
  let files: Record<string, string> = {};
  if (model) {
    try {
      code = generate(model, runtime.policy);
      if (file && model.components?.length) files = generatePackage(model, runtime.policy);
    } catch (cause) {
      generationError = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function openPage(intent: PageIntent, approved?: SiteAccess, path?: ContextBoundary[]) {
    if (running.current || !settings) return;
    running.current = true;
    setBusy(true);
    runtime.invalidate();
    setError('');
    setSiteAccess(null);
    try {
      const [active] = await chrome.tabs.query({active: true, currentWindow: true});
      if (active?.id === undefined || !active.url) throw Error('No active page is available.');
      const url = new URL(active.url);
      const webPage = url.protocol === 'http:' || url.protocol === 'https:';
      if (!webPage && url.protocol !== 'file:') {
        throw Error('Open an HTTP or HTTPS page. Browser settings and internal pages are restricted.');
      }
      if (['chromewebstore.google.com', 'microsoftedge.microsoft.com'].includes(url.hostname)) {
        throw Error('Open a regular web page. Browser extension stores restrict page access.');
      }

      // Chrome match patterns cover a hostname across ports.
      const site = webPage ? url.protocol + '//' + url.hostname + '/*' : null;
      if (approved && (approved.site !== site || approved.tab !== active.id)) {
        throw Error('The active tab or site changed. Start the operation again on the intended page.');
      }

      let injected: chrome.scripting.InjectionResult[];
      try {
        injected = await chrome.scripting.executeScript({target: {tabId: active.id}, files: ['content.js']});
      } catch (cause) {
        if (!(cause instanceof Error) || !/cannot access|permission/i.test(cause.message)) throw cause;
        if (url.protocol === 'file:') {
          throw Error('Enable Allow access to file URLs in the extension details, then click the toolbar icon and scan again.');
        }
        if (site && !(await chrome.permissions.contains({origins: [site]}))) {
          setSiteAccess({site, intent, tab: active.id});
          setError('Allow access to this site to continue.');
          return;
        }
        throw cause;
      }

      const documentId = injected[0]?.documentId;
      if (tab !== active.id) {
        setEmbedded([]);
        setEmbeddedMessage('');
        setContextFilter('');
      }
      if (live.tab !== undefined && live.tab !== active.id) live.stop();
      if (intent === 'live') {
        if (tab !== null && tab !== active.id) setModel(null);
        setTab(active.id);
        live.start(active.id, settings, documentId);
        return;
      }
      if (intent === 'inspect') {
        embeddedInspection.current = undefined;
        const [current] = await chrome.tabs.query({active: true, currentWindow: true});
        if (current?.id !== active.id || current.url !== active.url) throw Error('The active page changed. Start inspection again.');
        inspector.start(active.id, active.windowId, settings, documentId);
        return;
      }
      const {staleIds, ...result}: PageModel & {staleIds?: string[]} = await chrome.tabs.sendMessage(active.id, {
        type: 'POM_SCAN', settings, path, tracked: model?.elements.flatMap(element => element.referenceId ? [element.referenceId] : []),
      }, documentId ? {documentId} : {frameId: 0});
      setTab(active.id);
      setModel(current => {
        const merged = mergePage(current, path ? {...result, contexts: current?.contexts} : result);
        if (!staleIds?.length) return merged;
        return {...merged, elements: merged.elements.map(element =>
          element.referenceId && staleIds.includes(element.referenceId) ? {...element, stale: true} : element)};
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const contextOptions = [...new Map((model?.elements ?? []).flatMap(row => row.context
    ? [[contextLabel(row.context), row.context] as const] : [])).entries()];
  const filteredContext = contextOptions.find(([label]) => label === contextFilter)?.[1];

  async function grantSiteAccess(access: SiteAccess) {
    try {
      // Start the request directly from the button click.
      if (await chrome.permissions.request({origins: [access.site]})) {
        await openPage(access.intent, access);
      } else {
        setError('Site access was declined. Allow access to scan this page.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }


  function update(id: string, patch: Partial<ElementModel>) {
    setModel(current => current && {
      ...current,
      elements: current.elements.map(element => element.id === id ? {...element, ...patch} : element),
    });
  }

  async function allowEmbedded(origin: string) {
    const documentKey = model?.documentKey;
    if (tab === null || !settings || !documentKey || running.current) return;
    running.current = true;
    setBusy(true);
    setEmbeddedMessage('');
    try {
      const address = new URL(origin);
      const granted = await chrome.permissions.request({permissions: ['webNavigation'],
        origins: [address.protocol + '//' + address.hostname + '/*']});
      if (!granted) {
        setEmbeddedMessage('Access was declined. The rest of the page can still be scanned.');
        return;
      }
      const [active] = await chrome.tabs.query({active: true, currentWindow: true});
      if (active?.id !== tab) throw Error('Switch to the tab with the embedded frame and try again.');
      const frames = await scanAuthorizedFrames(tab, origin, settings);
      if (!frames.length) {
        setEmbeddedMessage('The frame is unavailable or its owner could not be verified.');
        return;
      }
      const [current] = await chrome.tabs.query({active: true, currentWindow: true});
      if (current?.id !== tab || current.url !== active.url) throw Error('The active document changed. Scan again.');
      setEmbedded(items => [...items.filter(frame => frame.context.origin !== origin), ...frames]);
      const rows = frames.flatMap(frame => frame.rows);
      setModel(page => {
        if (page?.documentKey !== documentKey) return page;
        const available = new Set(rows.map(row => row.id));
        const preserved = page.elements.map(row => row.context?.external && row.context.origin === origin && !available.has(row.id) ?
          {...row, stale: true} : row);
        return mergePage({...page, elements: preserved}, {...page, elements: rows});
      });
      setEmbeddedMessage(`${frames.length} embedded frame(s) accessible.`);
    } catch (cause) {
      setEmbeddedMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function highlight(element: ElementModel) {
    if (tab === null) return;
    try {
      const frame = embedded.find(item => item.rows.some(row => row.id === element.id));
      if (element.context?.external && !frame) throw Error('Scan the embedded frame again before highlighting.');
      const result = await chrome.tabs.sendMessage(tab, {type: 'POM_HIGHLIGHT', id: element.referenceId ?? element.id},
        frame ? {documentId: frame.documentId} : {frameId: 0});
      if (!result?.ok) {
        update(element.id, {stale: true});
        throw Error('Element no longer available. Inspect the replacement to add it.');
      }
    } catch (cause) {
      setError(String(cause));
    }
  }

  function reorder(id: string, offset: number) {
    setModel(current => {
      if (!current) return current;
      const elements = [...current.elements];
      const index = elements.findIndex(element => element.id === id);
      const destination = index + offset;
      if (index < 0 || destination < 0 || destination >= elements.length) return current;
      [elements[destination], elements[index]] = [elements[index], elements[destination]];
      return {...current, elements};
    });
  }

  function remove(id?: string) {
    setModel(current => current && ({...current, elements: id ? current.elements.filter(element => element.id !== id) : []}));
  }

  return <>
    <h1>Page Object Generator</h1>
    {settings && <Settings settings={settings} onSave={saveSettings}/>}
    <RuntimeControls runtime={runtime} extensionId={chrome.runtime.id}/>
    <Review model={model} setModel={setModel} operation={runtime.sourceOperation} download={save}
      runtimeCheck={runtime.status?.connected ? runtime.validateImported : undefined} observationEpoch={runtime.observationEpoch}
      observe={async locators => {
      if (tab === null || !model?.documentKey) throw Error('Scan the target page first.');
      const [active] = await chrome.tabs.query({active: true, currentWindow: true});
      if (active?.id !== tab) throw Error('Switch to the scanned tab before checking locators.');
      const counts: unknown = await chrome.tabs.sendMessage(tab,
        {type: 'POM_IMPORTED_CHECK', documentKey: model.documentKey, locators}, {frameId: 0});
      if (!Array.isArray(counts) || counts.length !== locators.length || !counts.every(count =>
        count === null || (Number.isSafeInteger(count) && count >= 0))) throw Error('The scan is stale. Scan the page again.');
      return counts;
    }}/>
    <button disabled={!settings || busy || inspector.state === 'active' || inspector.state === 'starting'}
      onClick={() => void openPage('scan')}>Scan active page</button>
    <InspectorControls inspector={inspector} ready={!!settings && !busy} start={() => void openPage('inspect')}/>
    <section aria-label="Live discovery">
      {live.phase === 'off' || live.phase === 'disconnected'
        ? <button disabled={!settings || busy} onClick={() => void openPage('live')}>Enable live discovery</button>
        : <div className="actions">
          <button onClick={() => live.send(live.phase === 'paused' ? 'resume' : 'pause')}>
            {live.phase === 'paused' ? 'Resume live discovery' : 'Pause live discovery'}
          </button>
          <button disabled={live.phase !== 'live'} onClick={() => live.send('sync')}>Full rescan</button>
          <button disabled={live.phase !== 'live'} onClick={() => live.send('refresh')}>Refresh selected elements</button>
          <button onClick={() => live.stop()}>Disable live discovery</button>
        </div>}
      {live.phase !== 'off' && <p role="status">
        Live discovery {live.phase}{live.update && ` · ${live.update.context.route} · ${live.update.ready}`}
      </p>}
      {live.phase !== 'off' && runtime.status?.connected && <label>
        <input type="checkbox" checked={autoValidate} onChange={event => setAutoValidate(event.target.checked)}/>
        Automatically validate changed selected elements
      </label>}
      {live.update && <details>
        <summary>Live discovery details</summary>
        <p>{live.update.metrics.records} mutation records across {live.update.metrics.roots} roots.
          {' '}{live.update.metrics.durationMs} ms. {live.update.metrics.fullScans} full scans.</p>
        {live.update.collections.map(collection => <p key={collection.id}>
          {model?.components?.find(definition => definition.id === collection.id)?.title ?? collection.id}
          {' · '}{collection.rendered} rendered{collection.total && ` of ${collection.total}`}
          {collection.virtual && ' · Virtualized'}{collection.reordered && ' · Reordered'}
          {collection.duplicateKeys && ' · Duplicate keys'}
        </p>)}
      </details>}
    </section>
    {siteAccess && <button onClick={() => void grantSiteAccess(siteAccess)}>Allow access to this site</button>}
    {error && <p className="error">{error}</p>}
    {pick && model?.elements.some(element => element.id === pick.id) &&
      <small role="status">{pick.duplicate ? 'Element already in collection.' : 'Element added to collection.'}</small>}
    {model && <>
      <small>{model.url}</small>
      {!!model.contexts?.length && <details>
        <summary>Browsing contexts ({model.contexts.length})</summary>
        <label>Filter by browsing context
          <select value={contextFilter} onChange={event => setContextFilter(event.target.value)}>
            <option value="">All contexts</option>
            <option value="top">Top document</option>
            {contextOptions.map(([label]) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        <button disabled={busy || !contextFilter || Boolean(filteredContext?.external) ||
          (contextFilter !== 'top' && !filteredContext)} onClick={() => void openPage('scan', undefined, filteredContext?.path ?? [])}>
          Scan selected context
        </button>
        <small>Open shadow roots are discoverable. Closed or otherwise unobservable roots are unavailable.</small>
        <ul>{model.contexts.map((context, index) => <li key={index}>{contextLabel(context)} · {
          embedded.some(frame => contextLabel(frame.context) === contextLabel(context)) ? 'accessible' : context.state}</li>)}</ul>
        {[...new Set(model.contexts.flatMap(context => context.origin ? [context.origin] : []))].map(origin =>
          <button key={origin} disabled={busy} onClick={() => void allowEmbedded(origin)}>Scan embedded frames from {origin}</button>)}
        {embedded.map(frame => <button key={frame.documentId} disabled={!settings || busy} onClick={() => {
          if (tab === null || !settings) return;
          embeddedInspection.current = frame;
          inspector.start(tab, undefined, settings, frame.documentId);
        }}>Inspect {contextLabel(frame.context)}</button>)}
        {embeddedMessage && <p role="status">{embeddedMessage}</p>}
      </details>}
      {settings && tab !== null && <ComponentsPanel model={model} settings={settings} setModel={setModel}
        liveSuggestions={live.update?.proposals}
        request={(type, value) => chrome.tabs.sendMessage(tab, {type, documentKey: model.documentKey, ...value}, {frameId: 0})}
        highlight={element => void highlight(element)}
        versionWarning={runtime.status?.connected && !runtime.status.strategies?.includes('chain')}
        validate={runtime.status?.connected && runtime.status.strategies?.includes('chain') && !runtime.busy
          ? jobs => void runtime.validate(jobs) : undefined}/>}
      <label>Python class
        <input type="text" value={model.className} onChange={event => setModel({...model, className: event.target.value})}/>
      </label>
      {model.application && <label>Application state label
        <input maxLength={120} value={model.application.stateLabel ?? ''} onChange={event => {
          const stateLabel = event.target.value;
          setModel(current => current && {...current, application: {...current.application!, stateLabel}});
        }}/>
      </label>}
      <div className="actions">
        {[true, false].map(selected => <button key={String(selected)} onClick={() =>
          setModel({...model, elements: model.elements.map(element => ({...element, selected}))})
        }>{selected ? 'Select all' : 'Clear all'}</button>)}
        <button onClick={() => remove()}>Remove all elements</button>
      </div>
      <p>{model.elements.filter(element => element.selected).length} selected / {model.elements.length} discovered</p>
      {runtime.status?.connected && <button disabled={runtime.busy} onClick={() => void runtime.validate(
        model.elements.flatMap(element => {
          const candidate = selectedCandidate(element) ?? element.candidates[0];
          return element.selected && candidate ? [{element, candidates: [candidate]}] : [];
        }))}>Validate selected elements</button>}
      {model.elements.map((element, index) => {
        if (contextFilter && (element.context ? contextLabel(element.context) : 'top') !== contextFilter) return null;
        return <article key={element.id} ref={pick?.id === element.id ? selectedRow : undefined}>
        <label>
          <input type="checkbox" checked={element.selected} onChange={event => update(element.id, {selected: event.target.checked})}/>
          {' '}{element.label}
        </label>
        <input aria-label="Python element name" type="text" value={element.name}
          onChange={event => update(element.id, {name: event.target.value})}/>
        {element.context && <small>{contextLabel(element.context)}</small>}
        <LocatorControls element={element} onChoice={choice => update(element.id, {choice})}
          onValidate={runtime.status?.connected && !runtime.busy ?
            candidates => void runtime.validate([{element, candidates}]) : undefined}/>
        {element.stale && <small className="error">{element.availability === 'unavailable'
          ? 'Unavailable in the current application state. Review any replacement before using it.'
          : 'Detached element. Inspect its replacement to add it.'}</small>}
        <div className="actions">
          <button disabled={element.stale} onClick={() => void highlight(element)}>Highlight</button>
          {inspector.state === 'active' && <button disabled={element.stale || Boolean(element.context?.external) !== Boolean(embeddedInspection.current)}
            onClick={() => inspector.send({type: 'inspect', id: element.referenceId ?? element.id})}>Inspect</button>}
          <button disabled={index === 0} onClick={() => reorder(element.id, -1)}>Move up</button>
          <button disabled={index === model.elements.length - 1} onClick={() => reorder(element.id, 1)}>Move down</button>
          <button onClick={() => remove(element.id)}>Remove</button>
        </div>
      </article>;
      })}
      <h2>Python preview</h2>
      {generationError && <p className="error">{generationError}</p>}
      {!!model.components?.length && <select aria-label="Python output file" value={file} onFocus={() => {
        if (!file) setFile('single');
      }} onChange={event => setFile(event.target.value)}>
        <option value="single">Single Python file</option>
        {Object.keys(files).map(path => <option key={path} value={path}>{path}</option>)}
      </select>}
      <textarea readOnly value={files[file] ?? code}/>
      <div className="actions">
        <button disabled={!code} onClick={() => save(model.className.trim() + '.py', code)}>Export Python</button>
        <button disabled={!code} onClick={() => navigator.clipboard.writeText(files[file] ?? code)
          .catch(cause => setError(String(cause)))}>Copy Python</button>
        <button onClick={() => {
          try {save('page-model.json', serializePage(model), 'application/json');}
          catch (cause) {setError(cause instanceof Error ? cause.message : String(cause));}
        }}>Export JSON</button>
        {!!model.components?.length && <button disabled={!code} onClick={() => {
          try {
            download('generated-python.zip', pythonPackageZip(generatePackage(model, runtime.policy)));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}>Export Python package</button>}
      </div>
    </>}
  </>;
}

function save(name: string, body: string, type = 'text/plain') {
  download(name, new Blob([body], {type}));
}

function download(name: string, body: Blob) {
  const url = URL.createObjectURL(body);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const extension = globalThis.chrome;
const ready = extension?.storage?.local && extension.runtime && extension.tabs && extension.scripting;

createRoot(document.getElementById('root')!).render(ready ? <App/> : <main>
  <h1>Page Object Generator</h1>
  <p role="alert">The browser extension APIs are unavailable.</p>
  <p>Load or reload the built dist folder as an unpacked extension at chrome://extensions or edge://extensions.
    Then open the side panel from the extension’s toolbar icon.</p>
</main>);
