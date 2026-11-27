import React,{useState} from 'react';import{createRoot}from'react-dom/client';import type{PageModel,ElementModel}from'../core/model';import{generate}from'../core/python';
function App(){const [model,setModel]=useState<PageModel|null>(null),[tab,setTab]=useState<number|null>(null),[error,setError]=useState('');let code='';let generationError='';if(model)try{code=generate(model)}catch(e){generationError=String(e)}
const [siteAccess, setSiteAccess] = useState<string | null>(null);

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

    const result = await chrome.tabs.sendMessage(active.id, {type: 'POM_SCAN'});
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

function update(id:string,patch:Partial<ElementModel>){setModel(m=>m&&({...m,elements:m.elements.map(e=>e.id===id?{...e,...patch}:e)}));}function save(name:string,body:string){const url=URL.createObjectURL(new Blob([body],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}return <><h1>Page Object Generator</h1><button onClick={() => void scan()}>Scan active page</button>{siteAccess && <button onClick={() => void grantSiteAccess(siteAccess)}>Allow access to this site</button>}{error&&<p className="error">{error}</p>}{model&&<><small>{model.url}</small><label>Python class<input type="text" value={model.className} onChange={e=>setModel({...model,className:e.target.value})}/></label><div className="actions">{[true,false].map(v=><button key={String(v)} onClick={()=>setModel({...model,elements:model.elements.map(e=>({...e,selected:v}))})}>{v?'Select all':'Clear all'}</button>)}</div><p>{model.elements.filter(e=>e.selected).length} selected / {model.elements.length} discovered</p>{model.elements.map(e=><article key={e.id}><label><input type="checkbox" checked={e.selected} onChange={x=>update(e.id,{selected:x.target.checked})}/> {e.label}</label><input aria-label="Python element name" type="text" value={e.name} onChange={x=>update(e.id,{name:x.target.value})}/><select aria-label="Locator" value={e.choice} onChange={x=>update(e.id,{choice:Number(x.target.value)})}>{e.candidates.map((c,i)=><option key={i} value={i}>{c.basis} · {c.count} matches · {c.score}</option>)}</select><small>{e.candidates[e.choice].expression}</small><button onClick={async()=>{try{if(tab!==null){const r=await chrome.tabs.sendMessage(tab,{type:'POM_HIGHLIGHT',id:e.id});if(!r.ok)throw Error('Element no longer available; rescan');}}catch(x){setError(String(x));}}}>Highlight</button></article>)}<h2>Python preview</h2>{generationError&&<p className="error">{generationError}</p>}<textarea readOnly value={code}/><div className="actions"><button disabled={!code} onClick={()=>save(model.className+'.py',code)}>Export Python</button><button disabled={!code} onClick={()=>navigator.clipboard.writeText(code).catch(e=>setError(String(e)))}>Copy Python</button><button onClick={()=>save('page-model.json',JSON.stringify(model,null,2))}>Export JSON</button></div></>}</>};createRoot(document.getElementById('root')!).render(<App/>);
