import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {defaultSettings, parseSettings, type LocatorSettings} from '../core/locator';
import {mergePage, serializePage, type ElementModel, type PageModel} from '../core/model';
import {generate} from '../core/python';
import {LocatorControls, Settings} from './locator-controls';
import {InspectorControls, useInspector} from './inspector';

const settingsKey = 'locatorSettings';
type PageIntent = 'scan' | 'inspect';
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
  const selectedRow = useRef<HTMLElement>(null);
  const inspector = useInspector(model, (incoming, sourceTab) => {
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
      }));
    }
    chrome.tabs.onUpdated?.addListener(invalidate);
    return () => chrome.tabs.onUpdated?.removeListener(invalidate);
  }, [tab]);
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
    setSettings(next);
  }

  let code = '';
  let generationError = '';
  if (model) {
    try {
      code = generate(model);
    } catch (cause) {
      generationError = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function openPage(intent: PageIntent, approved?: SiteAccess) {
    if (running.current || !settings) return;
    running.current = true;
    setBusy(true);
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
      if (intent === 'inspect') {
        const [current] = await chrome.tabs.query({active: true, currentWindow: true});
        if (current?.id !== active.id || current.url !== active.url) throw Error('The active page changed. Start inspection again.');
        inspector.start(active.id, active.windowId, settings, documentId);
        return;
      }
      const {staleIds, ...result}: PageModel & {staleIds?: string[]} = await chrome.tabs.sendMessage(active.id, {
        type: 'POM_SCAN', settings, tracked: model?.elements.flatMap(element => element.referenceId ? [element.referenceId] : []),
      }, documentId ? {documentId} : {frameId: 0});
      setTab(active.id);
      setModel(current => {
        const merged = mergePage(current, result);
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

  async function highlight(element: ElementModel) {
    if (tab === null) return;
    try {
      const result = await chrome.tabs.sendMessage(tab, {type: 'POM_HIGHLIGHT', id: element.referenceId ?? element.id}, {frameId: 0});
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
    <button disabled={!settings || busy || inspector.state === 'active' || inspector.state === 'starting'}
      onClick={() => void openPage('scan')}>Scan active page</button>
    <InspectorControls inspector={inspector} ready={!!settings && !busy} start={() => void openPage('inspect')}/>
    {siteAccess && <button onClick={() => void grantSiteAccess(siteAccess)}>Allow access to this site</button>}
    {error && <p className="error">{error}</p>}
    {pick && model?.elements.some(element => element.id === pick.id) &&
      <small role="status">{pick.duplicate ? 'Element already in collection.' : 'Element added to collection.'}</small>}
    {model && <>
      <small>{model.url}</small>
      <label>Python class
        <input type="text" value={model.className} onChange={event => setModel({...model, className: event.target.value})}/>
      </label>
      <div className="actions">
        {[true, false].map(selected => <button key={String(selected)} onClick={() =>
          setModel({...model, elements: model.elements.map(element => ({...element, selected}))})
        }>{selected ? 'Select all' : 'Clear all'}</button>)}
        <button onClick={() => remove()}>Remove all elements</button>
      </div>
      <p>{model.elements.filter(element => element.selected).length} selected / {model.elements.length} discovered</p>
      {model.elements.map((element, index) => <article key={element.id} ref={pick?.id === element.id ? selectedRow : undefined}>
        <label>
          <input type="checkbox" checked={element.selected} onChange={event => update(element.id, {selected: event.target.checked})}/>
          {' '}{element.label}
        </label>
        <input aria-label="Python element name" type="text" value={element.name}
          onChange={event => update(element.id, {name: event.target.value})}/>
        <LocatorControls element={element} onChoice={choice => update(element.id, {choice})}/>
        {element.stale && <small className="error">Detached element. Inspect its replacement to add it.</small>}
        <div className="actions">
          <button disabled={element.stale} onClick={() => void highlight(element)}>Highlight</button>
          {inspector.state === 'active' && <button disabled={element.stale}
            onClick={() => inspector.send({type: 'inspect', id: element.referenceId ?? element.id})}>Inspect</button>}
          <button disabled={index === 0} onClick={() => reorder(element.id, -1)}>Move up</button>
          <button disabled={index === model.elements.length - 1} onClick={() => reorder(element.id, 1)}>Move down</button>
          <button onClick={() => remove(element.id)}>Remove</button>
        </div>
      </article>)}
      <h2>Python preview</h2>
      {generationError && <p className="error">{generationError}</p>}
      <textarea readOnly value={code}/>
      <div className="actions">
        <button disabled={!code} onClick={() => save(model.className.trim() + '.py', code)}>Export Python</button>
        <button disabled={!code} onClick={() => navigator.clipboard.writeText(code).catch(cause => setError(String(cause)))}>Copy Python</button>
        <button onClick={() => save('page-model.json', serializePage(model), 'application/json')}>Export JSON</button>
      </div>
    </>}
  </>;
}

function save(name: string, body: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([body], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

createRoot(document.getElementById('root')!).render(<App/>);
