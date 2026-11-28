import {useEffect, useState} from 'react';
import {generationProfiles, readGenerationProfile, resolveGeneration, type GenerationOptions, type GenerationProfile} from '../core/generation-profile';
import type {PageModel} from '../core/model';

const key = 'generationProfiles';
interface Suggestion {name: string; options: Partial<GenerationOptions>; evidence: string}

export function useGeneration() {
  const [custom, setCustom] = useState<GenerationProfile[]>([]);
  const [active, setActive] = useState<string>('sync');
  const [preferred, setPreferred] = useState<string>('sync');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion>();

  useEffect(() => {
    chrome.storage.local.get(key).then(result => {
      const saved = result[key];
      if (!saved) return;
      if (!Array.isArray(saved.custom) || saved.custom.length > 20) throw Error('Invalid saved generation profiles.');
      const profiles = saved.custom.map(readGenerationProfile) as GenerationProfile[];
      const ids = [...generationProfiles, ...profiles].map(item => item.id);
      if (new Set(ids).size !== ids.length) throw Error('Saved profile IDs conflict.');
      setCustom(profiles);
      if (ids.includes(saved.preferred)) {
        setPreferred(saved.preferred);
        setActive(saved.preferred);
      }
    }).catch(() => setMessage('Saved generation profiles could not be loaded.')).finally(() => setLoaded(true));
  }, []);

  function store(next: GenerationProfile[], nextPreferred = preferred) {
    setCustom(next);
    setPreferred(nextPreferred);
    void chrome.storage.local.set({[key]: {custom: next, preferred: nextPreferred}})
      .catch(() => setMessage('Profile changes could not be saved to extension storage.'));
  }

  const profiles = [...generationProfiles, ...custom];
  const profile = profiles.find(item => item.id === active) ?? generationProfiles[0];
  return {profiles, profile, preferred, loaded, custom, setActive, store, message, setMessage, suggestion, setSuggestion};
}

export function GenerationControls({generation, download, model}: {
  generation: ReturnType<typeof useGeneration>;
  download: (name: string, text: string) => void;
  model: PageModel | null;
}) {
  const {profiles, profile, preferred, custom, loaded, setActive, store, message, setMessage, suggestion, setSuggestion} = generation;
  const [draft, setDraft] = useState<GenerationProfile>();
  const [methodText, setMethodText] = useState('[]');
  const edit = custom.some(item => item.id === profile.id);
  let effective: string;
  try {
    effective = JSON.stringify(resolveGeneration(profile.options, model?.generation ?? {}), null, 2);
  } catch (error) {
    effective = error instanceof Error ? error.message : String(error);
  }
  function update<K extends keyof GenerationOptions>(name: K, value: GenerationOptions[K]) {
    setDraft(current => current && {...current, options: {...current.options, [name]: value}});
  }
  function start() {
    setDraft(edit ? profile : {...profile, id: crypto.randomUUID(), name: profile.name + ' copy', revision: 0});
    setMethodText(JSON.stringify(profile.options.methods, null, 2));
    setMessage('');
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      const value = readGenerationProfile({...draft, revision: draft.revision + 1,
        options: {...draft.options, methods: JSON.parse(methodText)}});
      if (custom.length >= 20 && !custom.some(item => item.id === value.id)) throw Error('Keep at most 20 custom profiles.');
      store([...custom.filter(item => item.id !== value.id), value]);
      setActive(value.id);
      setDraft(undefined);
      setMessage('Generation profile saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }
  return <details>
    <summary>Generation profile</summary>
    <label>Active generation profile
      <select disabled={!loaded} value={profile.id} onChange={event => {
        setActive(event.target.value);
        setDraft(undefined);
      }}>{profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </label>
    <p>{profile.description}</p>
    {suggestion && <>
      <p>{suggestion.evidence}</p>
      <button onClick={() => {
        setDraft({...generationProfiles[0], id: crypto.randomUUID(), name: suggestion.name.slice(0, 80), revision: 0,
          description: 'Draft inferred from selected Python source.',
          options: {...generationProfiles[0].options, ...suggestion.options}});
        setMethodText('[]');
        setSuggestion(undefined);
      }}>Review inferred profile</button>
      <button onClick={() => setSuggestion(undefined)}>Dismiss inferred profile</button>
    </>}
    <button disabled={!loaded} onClick={start}>{edit ? 'Edit profile' : 'Duplicate profile'}</button>
    <button disabled={!loaded || preferred === profile.id} onClick={() => store(custom, profile.id)}>Make default</button>
    {edit && <button onClick={() => {
      store(custom.filter(item => item.id !== profile.id), preferred === profile.id ? 'sync' : preferred);
      setActive('sync');
      setDraft(undefined);
    }}>Delete profile</button>}
    <button onClick={() => download(profile.id + '.generation.json', JSON.stringify(profile, null, 2))}>Export profile</button>
    <label>Import generation profile
      <input type="file" accept=".json" disabled={!loaded} onChange={async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          if (file.size > 262144 || custom.length >= 20) throw Error('Choose a profile under 256 KiB and keep at most 20 custom profiles.');
          const value = readGenerationProfile(JSON.parse(await file.text()));
          const imported = {...value, id: profiles.some(item => item.id === value.id) ? crypto.randomUUID() : value.id};
          store([...custom, imported]);
          setActive(imported.id);
          setDraft(undefined);
          setMessage('Generation profile imported.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }}/>
    </label>
    <details><summary>Effective options</summary><pre>{effective}</pre></details>
    {message && <p role="status">{message}</p>}
    {draft && <form onSubmit={save}>
      <label>Profile name <input required maxLength={80} value={draft.name} onChange={event =>
        setDraft({...draft, name: event.target.value})}/></label>
      <label>Description <input maxLength={300} value={draft.description} onChange={event =>
        setDraft({...draft, description: event.target.value})}/></label>
      {([
        ['execution', 'Execution', ['sync', 'async']], ['annotations', 'Annotations', ['legacy', 'typed', 'none']],
        ['declaration', 'Locator declarations', ['constructor', 'property', 'method']],
        ['methodOrder', 'Method name order', ['action-first', 'member-first']], ['lineEnding', 'Line endings', ['lf', 'crlf']],
        ['packageImports', 'Package imports', ['relative', 'absolute']],
      ] as const).map(([field, label, values]) => <label key={field}>{label}
        <select value={draft.options[field]} onChange={event => update(field, event.target.value as GenerationOptions[typeof field])}>
          {values.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>)}
      {([
        ['interactions', 'Interaction methods'], ['assertions', 'Visibility assertions'], ['documentation', 'Method docstrings'],
        ['selectorConstants', 'Class constants for simple CSS selectors'],
        ['superPage', 'Forward page to base constructor'], ['superRoot', 'Forward root to component base constructor'],
        ['forwardBaseDependencies', 'Forward declared dependencies to the base constructor'],
      ] as const).map(([field, label]) => <label key={field}>
        <input type="checkbox" checked={draft.options[field]} onChange={event => update(field, event.target.checked)}/>{label}
      </label>)}
      {([
        ['baseModule', 'Base class module'], ['baseClass', 'Base class name'], ['memberPrefix', 'Member prefix'],
        ['componentBaseModule', 'Component base module'], ['componentBaseClass', 'Component base class'],
        ['methodPrefix', 'Method prefix'], ['packageName', 'Package name'], ['pagesDirectory', 'Page directory'],
        ['componentsDirectory', 'Component directory'], ['navigationPath', 'Navigation path'],
        ['pageModule', 'Page module name'],
      ] as const).map(([field, label]) => <label key={field}>{label}
        <input value={draft.options[field]} onChange={event => update(field, event.target.value)}/>
      </label>)}
      <fieldset>
        <legend>Constructor dependencies</legend>
        {draft.options.dependencies.map((dependency, index) => <div key={index}>
          {(['name', 'module', 'type'] as const).map(field => <label key={field}>{'Dependency ' + (index + 1) + ' ' + field}
            <input value={dependency[field]} onChange={event => update('dependencies',
              draft.options.dependencies.map((item, position) => position === index ? {...item, [field]: event.target.value} : item))}/>
          </label>)}
          <button type="button" onClick={() => update('dependencies', draft.options.dependencies.filter((_, position) => position !== index))}>
            Remove dependency {index + 1}
          </button>
        </div>)}
        <button type="button" disabled={draft.options.dependencies.length >= 8} onClick={() => update('dependencies',
          [...draft.options.dependencies, {name: '', module: '', type: ''}])}>Add dependency</button>
        <label>Logging dependency
          <select value={draft.options.logger} onChange={event => update('logger', event.target.value)}>
            <option value="">None</option>
            {draft.options.dependencies.map((item, index) => <option key={index} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      </fieldset>
      <label>Indentation <select value={draft.options.indent} onChange={event => update('indent', event.target.value === '2' ? 2 : 4)}>
        <option value={2}>Two spaces</option><option value={4}>Four spaces</option>
      </select></label>
      <label>Python syntax target <select value={draft.options.pythonMinor}
        onChange={event => update('pythonMinor', Number(event.target.value) as GenerationOptions['pythonMinor'])}>
        {[10, 11, 12, 13].map(version => <option value={version} key={version}>{'3.' + version}</option>)}
      </select></label>
      <label>Timeout in milliseconds <input type="number" min={0} max={120000} value={draft.options.timeoutMs}
        onChange={event => update('timeoutMs', Number(event.target.value))}/></label>
      <label>Header comment template <textarea maxLength={2000} value={draft.options.header} onChange={event => update('header', event.target.value)}/></label>
      <label>Configured methods JSON <textarea maxLength={16000} value={methodText} onChange={event => setMethodText(event.target.value)}/></label>
      {!!model?.elements.some(item => item.selected) && <details><summary>Selected element IDs</summary>
        <ul>{model.elements.filter(item => item.selected).slice(0, 100).map(item =>
          <li key={item.id}>{item.name} · {item.id}</li>)}</ul>
      </details>}
      <button type="submit">Save profile</button>
      <button type="button" onClick={() => setDraft(undefined)}>Cancel editing</button>
    </form>}
  </details>;
}
