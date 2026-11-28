import {useEffect, useRef, useState} from 'react';
import type {PageModel} from '../core/model';
import {assess, readAnalysis, readPageModel, type SourceAnalysis} from '../core/review';
import {pythonLocator} from '../core/python';
import {serializePage} from '../core/model';
import {selectedCandidate} from '../core/locator';
import type {Locator} from '../core/locator';
import type {RuntimeResult} from '../core/runtime';

interface SourceFile {name: string; source: string; analysis: SourceAnalysis}
interface Preview {source: string; patch: string; file: SourceFile; observation: PageModel | null}

export function Review({model, setModel, operation, download, observe, runtimeCheck, observationEpoch}: {
  model: PageModel | null;
  setModel: (model: PageModel) => void;
  operation: (kind: 'source-analyze' | 'source-transform', payload: object) => Promise<Record<string, unknown>>;
  download: (name: string, text: string) => void;
  observe: (locators: Locator[]) => Promise<(number | null)[]>;
  runtimeCheck?: (locators: Locator[]) => Promise<RuntimeResult[]>;
  observationEpoch: number;
}) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<PageModel>();
  const [counts, setCounts] = useState<(number | null)[]>();
  const [runtimeResults, setRuntimeResults] = useState<RuntimeResult[]>();
  const file = files[index];
  const latest = useRef(model);
  latest.current = model;

  useEffect(() => {
    setChecked([]);
    setRejected([]);
    setPreview(undefined);
    setCounts(undefined);
    setRuntimeResults(undefined);
  }, [file, model, saved, observationEpoch]);

  async function importFiles(picked: File[]) {
    if (!picked.length || busy) return;
    setBusy(true);
    setStatus('');
    try {
      if (picked.length === 1 && /\.json$/i.test(picked[0].name)) {
        if (picked[0].size > 1_000_000) throw Error('Choose a JSON model under 1 MB.');
        const imported = readPageModel(await picked[0].text());
        setSaved(imported);
        setFiles([]);
        setModel(imported);
        setStatus('JSON model opened. Imported references and runtime evidence were cleared.');
        return;
      }
      if (picked.length > 10 || picked.some(item => !/^[\w.-]{1,100}\.py$/.test(item.name) || item.size > 65536) ||
        new Set(picked.map(item => item.name)).size !== picked.length) {
        throw Error('Choose up to ten Python files under 64 KiB each with distinct filenames.');
      }
      const imported = [];
      for (const item of picked) {
        const source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await item.arrayBuffer());
        if (source.startsWith('\uFEFF')) throw Error('Choose UTF-8 Python files without a byte order mark.');
        const analysis = readAnalysis(await operation('source-analyze', {source}));
        imported.push({name: item.name, source, analysis});
      }
      setFiles(imported);
      setIndex(0);
      setStatus(`Opened ${imported.length} Python file(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkLocators(runtime = false) {
    const observation = model;
    const locators = file ? file.analysis.entries.map(entry => entry.locator) : savedLocators.map(item => item.locator);
    setBusy(true);
    try {
      if (runtime && runtimeCheck) {
        const result = await runtimeCheck(locators.slice(0, 40));
        if (latest.current !== observation) throw Error('The page observation changed. Check the locators again.');
        setRuntimeResults(result);
        setStatus(`Checked ${result.length} imported locators with Playwright. Target identity is unconfirmed.`);
        return;
      }
      const result = await observe(locators.slice(0, 100));
      if (latest.current !== observation) throw Error('The page observation changed. Check the locators again.');
      setCounts(result);
      setStatus(`Checked ${result.length} locators using browser-side matching.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function prepare(current?: File) {
    if (!file || !current || busy || !checked.length) return;
    setBusy(true);
    setPreview(undefined);
    const observation = model;
    try {
      if (current.name !== file.name || current.size > 65536) throw Error('Choose the current version of ' + file.name + '.');
      const source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await current.arrayBuffer());
      const changes = file.analysis.entries.flatMap((entry): {id: string; locator: Locator}[] => {
        if (!entry.editable || !checked.includes(entry.id)) return [];
        const replacement = assess(entry, observation).replacement;
        return replacement ? [{id: entry.id, locator: replacement}] : [];
      });
      if (!changes.length || latest.current !== observation) throw Error('The observation changed. Review the proposed locators again.');
      const original = changes.map(change => file.analysis.entries.find(entry => entry.id === change.id)!.locator);
      const checks = await observe([...original, ...changes.map(change => change.locator)]);
      if (checks.slice(0, changes.length).some(count => count === 1 || count === null) ||
        checks.slice(changes.length).some(count => count !== 1)) {
        throw Error('A locator changed or its replacement is no longer unique. Check the locators and review again.');
      }
      const result = await operation('source-transform', {source, filename: file.name, revision: file.analysis.revision, changes});
      if (latest.current !== observation) throw Error('The observation changed while preparing the diff.');
      if (typeof result.source !== 'string' || typeof result.patch !== 'string') throw Error('Invalid transformation response.');
      setPreview({source: result.source, patch: result.patch, file, observation});
      setStatus('Review the diff before downloading.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const savedLocators = saved?.elements.flatMap(row => {
    const candidate = selectedCandidate(row);
    return candidate ? [{name: row.name, locator: candidate.locator}] : [];
  }) ?? [];
  const countLabel = (index: number) => counts?.[index] === undefined ? 'Unchecked' :
    counts[index] === null ? 'Unavailable' : counts[index] === 0 ? 'No match' :
      counts[index] === 1 ? 'One match · Identity unconfirmed' : `${counts[index]} matches · Ambiguous`;
  return <details>
    <summary>Manage existing page objects</summary>
    <label>Open Python files or a JSON model
      <input type="file" accept=".py,.json" multiple disabled={busy} onChange={event => {
        const picked = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        void importFiles(picked);
      }}/>
    </label>
    {status && <p role="status">{status}</p>}
    {(file || saved) && <button disabled={busy} onClick={() => {
      setFiles([]);
      setSaved(undefined);
      setChecked([]);
      setRejected([]);
      setPreview(undefined);
      setCounts(undefined);
      setStatus('Imported review artifacts cleared.');
    }}>Clear imported artifacts</button>}
    {saved && <div className="actions">
      <button disabled={busy} onClick={() => {setFiles([]); setModel(saved);}}>Reopen saved model</button>
      <button disabled={busy} onClick={() => download('saved-page-model.json', serializePage(saved))}>Download saved model</button>
    </div>}
    {(file || saved) && <button disabled={busy || !model?.documentKey} onClick={() => void checkLocators()}>
      Check imported locators
    </button>}
    {(file || saved) && runtimeCheck && <button disabled={busy || !model?.documentKey} onClick={() => void checkLocators(true)}>
      Validate imported locators with Playwright
    </button>}
    {!file && saved && (counts || runtimeResults) && <ul>{savedLocators.slice(0, 100).map((item, number) =>
      <li key={number}>{item.name} · {countLabel(number)}{runtimeResults?.[number] && ` · Playwright ${runtimeResults[number].status}`}</li>)}</ul>}
    {file && <>
      <label>Source file
        <select value={index} disabled={busy} onChange={event => setIndex(Number(event.target.value))}>
          {files.map((item, number) => <option key={item.name} value={number}>{item.name}</option>)}
        </select>
      </label>
      <p>{file.analysis.classes.length} classes · {file.analysis.entries.length} supported locator assignments</p>
      {file.analysis.classes.length > 0 && <ul>{file.analysis.classes.map(entry =>
        <li key={entry.line}>{entry.name} · line {entry.line}{entry.bases.length ? ` · Bases ${entry.bases.join(', ')}` : ''}</li>)}</ul>}
      {file.analysis.diagnostics.length > 0 && <ul>{file.analysis.diagnostics.map(item =>
        <li key={item.line}>Line {item.line} uses a locator expression that requires manual review.</li>)}</ul>}
      <button onClick={() => download(file.name, file.source)}>Download original</button>
      <button onClick={() => download(file.name + '.review.json', JSON.stringify({
        schemaVersion: 1, filename: file.name, revision: file.analysis.revision,
        checkedByBrowser: counts?.length ?? 0,
        diagnostics: file.analysis.diagnostics,
        locators: file.analysis.entries.map((entry, number) => ({className: entry.className, name: entry.name,
          line: entry.line, editable: entry.editable, matches: counts?.[number], health: assess(entry, model).status,
          dependencies: entry.dependencies, decision: checked.includes(entry.id) ? 'approved' :
            rejected.includes(entry.id) ? 'rejected' : 'pending'})),
      }, null, 2))}>Download review report</button>
      {file.analysis.entries.map((entry, number) => {
        const assessment = assess(entry, model);
        return <article key={entry.id}>
          <strong>{entry.className}.{entry.name} · line {entry.line}</strong>
          <code>{pythonLocator(entry.locator)}</code>
          <p>{assessment.status}{!entry.editable && ' · Read only'}</p>
          {entry.dependencies.length > 0 && <p>Reads {entry.dependencies.map(name => {
            const uses = file.analysis.entries.filter(item => item.dependencies.includes(name)).length;
            return `${name} (${uses} supported assignment${uses === 1 ? '' : 's'})`;
          }).join(', ')}</p>}
          {counts && <p>{countLabel(number)}</p>}
          {runtimeResults?.[number] && <p>Playwright {runtimeResults[number].status} · Identity {runtimeResults[number].identity}</p>}
          {assessment.replacement && entry.editable && !rejected.includes(entry.id) && <label>
            <input type="checkbox" disabled={busy} checked={checked.includes(entry.id)} onChange={event => {
              setPreview(undefined);
              setChecked(event.target.checked ? [...checked, entry.id] : checked.filter(key => key !== entry.id));
            }}/>
            Approve {pythonLocator(assessment.replacement)}
          </label>}
          {assessment.replacement && entry.editable && <button disabled={busy} onClick={() => {
            setPreview(undefined);
            setChecked(items => items.filter(id => id !== entry.id));
            setRejected(items => items.includes(entry.id) ? items.filter(id => id !== entry.id) : [...items, entry.id]);
          }}>{rejected.includes(entry.id) ? 'Restore proposal' : 'Reject proposal'}</button>}
        </article>;
      })}
      <label>Choose current source to preview approved changes
        <input type="file" accept=".py" disabled={busy || !checked.length} onChange={event => {
          const current = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void prepare(current);
        }}/>
      </label>
      {preview?.file === file && preview.observation === model && <>
        <textarea aria-label="Source diff" readOnly value={preview.patch}/>
        <button onClick={() => download(file.name, preview.source)}>Download updated Python</button>
        <button onClick={() => download(file.name + '.patch', preview.patch)}>Download patch</button>
        <button onClick={() => {setPreview(undefined); setChecked([]);}}>Discard preview</button>
      </>}
    </>}
  </details>;
}
