import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {defaultSettings, parseSettings, type LocatorSettings} from '../core/locator';
import {serializePage, type ElementModel, type PageModel} from '../core/model';
import {generate} from '../core/python';
import {LocatorControls, Settings} from './locator-controls';

const settingsKey = 'locatorSettings';

function App() {
  const [model, setModel] = useState<PageModel | null>(null);
  const [tab, setTab] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [siteAccess, setSiteAccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<LocatorSettings | null>(null);
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

  async function scan(approvedSite?: string) {
    setError('');
    setSiteAccess(null);
    setModel(null);
    setTab(null);
    try {
      const [active] = await chrome.tabs.query({active: true, currentWindow: true});
      if (active?.id === undefined || !active.url) throw Error('No active page is available.');
      const url = new URL(active.url);
      const webPage = url.protocol === 'http:' || url.protocol === 'https:';
      if (!webPage && url.protocol !== 'file:') {
        throw Error('Open an HTTP or HTTPS page to scan. Browser settings and internal pages are restricted.');
      }

      // Chrome match patterns cover a hostname across ports.
      const site = webPage ? url.protocol + '//' + url.hostname + '/*' : null;
      if (approvedSite && approvedSite !== site) {
        throw Error('The active site changed. Click Scan active page to scan the new site.');
      }

      try {
        await chrome.scripting.executeScript({target: {tabId: active.id}, files: ['content.js']});
      } catch (cause) {
        if (!(cause instanceof Error) || !/cannot access|permission/i.test(cause.message)) throw cause;
        if (url.protocol === 'file:') {
          throw Error('Enable Allow access to file URLs in the extension details, then click the toolbar icon and scan again.');
        }
        if (site && !(await chrome.permissions.contains({origins: [site]}))) {
          setSiteAccess(site);
          setError('To scan this page, allow access to this site.');
          return;
        }
        throw cause;
      }

      const result = await chrome.tabs.sendMessage(active.id, {type: 'POM_SCAN', settings: settings ?? defaultSettings});
      setTab(active.id);
      setModel(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function grantSiteAccess(site: string) {
    try {
      // Start the request directly from the button click.
      if (await chrome.permissions.request({origins: [site]})) {
        await scan(site);
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

  async function highlight(id: string) {
    if (tab === null) return;
    try {
      const result = await chrome.tabs.sendMessage(tab, {type: 'POM_HIGHLIGHT', id});
      if (!result.ok) throw Error('Element no longer available. Scan again.');
    } catch (cause) {
      setError(String(cause));
    }
  }

  return <>
    <h1>Page Object Generator</h1>
    {settings && <Settings settings={settings} onSave={saveSettings}/>}
    <button disabled={!settings} onClick={() => void scan()}>Scan active page</button>
    {siteAccess && <button onClick={() => void grantSiteAccess(siteAccess)}>Allow access to this site</button>}
    {error && <p className="error">{error}</p>}
    {model && <>
      <small>{model.url}</small>
      <label>Python class
        <input type="text" value={model.className} onChange={event => setModel({...model, className: event.target.value})}/>
      </label>
      <div className="actions">
        {[true, false].map(selected => <button key={String(selected)} onClick={() =>
          setModel({...model, elements: model.elements.map(element => ({...element, selected}))})
        }>{selected ? 'Select all' : 'Clear all'}</button>)}
      </div>
      <p>{model.elements.filter(element => element.selected).length} selected / {model.elements.length} discovered</p>
      {model.elements.map(element => <article key={element.id}>
        <label>
          <input type="checkbox" checked={element.selected} onChange={event => update(element.id, {selected: event.target.checked})}/>
          {' '}{element.label}
        </label>
        <input aria-label="Python element name" type="text" value={element.name}
          onChange={event => update(element.id, {name: event.target.value})}/>
        <LocatorControls element={element} onChoice={choice => update(element.id, {choice})}/>
        <button onClick={() => void highlight(element.id)}>Highlight</button>
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
