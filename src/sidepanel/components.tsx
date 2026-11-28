import {useEffect, useState, type Dispatch, type SetStateAction} from 'react';
import {componentRootCandidate, memberCandidate, parameterLocator, preserveMemberEdits, validateComponentGraph,
  type ComponentDefinition, type ComponentLink, type ComponentMember, type ComponentRuntimeReport} from '../core/components';
import {locatorKey, selectedCandidate, type Locator, type LocatorSettings} from '../core/locator';
import type {ElementModel, PageModel} from '../core/model';
import {pythonLocator} from '../core/python';
import {currentEvidence} from '../core/runtime';
import type {RuntimeJob} from './runtime';

interface Props {
  model: PageModel;
  settings: LocatorSettings;
  request: (type: string, value?: object) => Promise<unknown>;
  setModel: Dispatch<SetStateAction<PageModel | null>>;
  highlight: (element: ElementModel) => void;
  validate?: (jobs: RuntimeJob[]) => void;
  versionWarning?: boolean;
  liveSuggestions?: ComponentDefinition[];
}

function runtimeJobs(definition: ComponentDefinition): RuntimeJob[] {
  const jobs: RuntimeJob[] = [];
  function add(instance: ComponentDefinition['instances'][number], candidateId: string, locator: Locator,
    element: ElementModel, memberId?: string, scopeId?: string,
    special?: {expectedCount?: number; relationship?: string; matches: (definition: ComponentDefinition, root: typeof instance) => boolean}) {
    jobs.push({
      element, scopeId,
      candidates: [{id: candidateId, locator, score: 0, basis: 'Component', explanations: [], warnings: [],
        validation: {method: 'none', status: 'unvalidated'}}],
      apply: (model, results) => ({
        ...model, components: model.components?.map(current => {
          const latest = current.instances.find(item => item.id === instance.id);
          if (current.id !== definition.id || !latest || latest.root.referenceId !== instance.root.referenceId) return current;
          const root = componentRootCandidate(latest.root);
          const member = current.members.find(item => item.id === memberId);
          if (memberId && (!root || !member || locator.strategy !== 'chain' ||
            locatorKey(root.locator) !== locatorKey(locator.root) ||
            member.observations.find(observation => observation.instanceId === instance.id)?.referenceId !== element.referenceId ||
            !member.candidates.some(candidate => candidate.id === candidateId &&
              locatorKey(candidate.locator) === locatorKey(locator.child)))) return current;
          if (!memberId && (special ? !special.matches(current, latest) : root?.id !== candidateId)) return current;
          return {...current, runtime: [...(current.runtime ?? []).filter(report =>
            report.instanceId !== instance.id || report.memberId !== memberId || report.evidence.candidateId !== candidateId),
          {instanceId: instance.id, memberId, relationship: special?.relationship,
            expectedCount: special?.expectedCount, evidence: results[0]}]};
        }),
      }),
    });
  }
  for (const instance of definition.instances) {
    const root = componentRootCandidate(instance.root);
    if (!root || !instance.root.referenceId) continue;
    add(instance, root.id, root.locator, instance.root);
    const parameter = parameterLocator(definition, instance);
    if (parameter) add(instance, 'parameter', parameter, instance.root, undefined, undefined, {
      relationship: 'Heading lookup',
      matches: (current, latest) => {
        const updated = parameterLocator(current, latest);
        return !!updated && locatorKey(updated) === locatorKey(parameter);
      },
    });
    for (const link of definition.children) {
      const observation = link.observations?.find(item => item.parentReference === instance.root.referenceId);
      if (!observation) continue;
      add(instance, 'relationship-' + link.name, {strategy: 'chain', root: root.locator, child: link.locator},
        {...instance.root, referenceId: link.collection ? undefined : observation.childReferences[0]}, undefined, instance.root.referenceId, {
          relationship: link.name, expectedCount: link.collection ? observation.childReferences.length : undefined,
          matches: current => componentRootCandidate(current.instances.find(item => item.id === instance.id)!.root)?.id === root.id &&
            current.children.some(item => item.name === link.name && locatorKey(item.locator) === locatorKey(link.locator)),
        });
    }
    for (const member of definition.members.filter(item => item.selected)) {
      const candidate = memberCandidate(member, definition.runtime);
      const observation = member.observations.find(item => item.instanceId === instance.id);
      if (!candidate || !observation) continue;
      add(instance, candidate.id, {strategy: 'chain', root: root.locator, child: candidate.locator},
        {...member, referenceId: observation.referenceId}, member.id, instance.root.referenceId);
    }
  }
  if (definition.collection && definition.instances[0]) {
    const collection = definition.collection;
    add(definition.instances[0], 'collection', collection.locator,
      {...definition.instances[0].root, referenceId: undefined}, undefined, undefined, {
        expectedCount: collection.count, relationship: 'Collection',
        matches: current => !!current.collection && locatorKey(current.collection.locator) === locatorKey(collection.locator),
      });
  }
  return jobs;
}

export function ComponentsPanel({model, settings, request, setModel, highlight, validate, versionWarning, liveSuggestions}: Props) {
  const [suggestions, setSuggestions] = useState<ComponentDefinition[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rootId, setRootId] = useState('');
  const [nested, setNested] = useState('');
  const definitions = model.components ?? [];
  useEffect(() => {
    setSuggestions([]);
    setRootId('');
    setNested('');
    setMessage('');
  }, [model.documentKey]);

  function edit(change: (page: PageModel) => PageModel) {
    setModel(current => current && current.documentKey === model.documentKey ? change(current) : current);
  }

  function save(definition: ComponentDefinition) {
    edit(current => {
      const existing = current.components ?? [];
      const components = existing.some(item => item.id === definition.id)
        ? existing.map(item => item.id === definition.id ? definition : item) : [...existing, definition];
      return {...current, components};
    });
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {await operation();}
    catch (error) {setMessage(error instanceof Error ? error.message : 'Component operation failed.');}
    finally {setBusy(false);}
  }

  async function define(references: string[], current?: ComponentDefinition) {
    const found = await request('POM_COMPONENT_DEFINE', {references, settings}) as ComponentDefinition | null;
    if (!found) throw Error('One or more component roots are unavailable. Inspect the current document again.');
    const previous = current ?? definitions.find(definition => definition.id === found.id);
    save(previous ? preserveMemberEdits(previous, found) : found);
    setMessage(current ? 'Component observations updated.' : 'Component definition added.');
  }

  function move(definition: ComponentDefinition) {
    const members = definition.members.map(member => {
      const row = model.elements.find(element => element.selected &&
        member.observations.some(observation => observation.referenceId === element.referenceId));
      if (!row) return member;
      const previous = selectedCandidate(row);
      const scoped = previous && member.candidates.find(candidate => locatorKey(candidate.locator) === locatorKey(previous.locator));
      return {...member, name: row.name, action: row.action, selected: true, choice: row.choice ? scoped?.id ?? row.choice : null};
    });
    const references = new Set(members.flatMap(member => member.selected
      ? member.observations.flatMap(observation => observation.referenceId ? [observation.referenceId] : []) : []));
    const movedRows = [...new Set([...(definition.movedRows ?? []), ...model.elements.flatMap(element =>
      element.selected && element.referenceId && references.has(element.referenceId) ? [element.id] : [])])];
    edit(current => ({...current, elements: current.elements.map(element => element.referenceId && references.has(element.referenceId)
      ? {...element, selected: false} : element),
    components: current.components?.map(item => item.id === definition.id ? {...item, members, movedRows} : item)}));
    setMessage('Matching page rows were moved. Review any locator choice that needs a new scope.');
  }

  async function restore(member: ComponentMember) {
    const referenceId = member.observations.find(item => item.referenceId)?.referenceId;
    if (!referenceId) throw Error('This component member is unavailable.');
    const row = await request('POM_COMPONENT_PAGE_ELEMENT', {referenceId, settings}) as ElementModel | null;
    if (!row) throw Error('The component member is detached.');
    edit(current => {
      const previous = current.elements.find(element => element.referenceId === referenceId);
      const restored = {...row, name: member.name, action: member.action, selected: true,
        choice: previous?.choice ?? (row.candidates.some(candidate => candidate.id === member.choice) ? member.choice : null)};
      return {...current, elements: previous ? current.elements.map(element =>
        element.referenceId === referenceId ? {...restored, id: element.id} : element) : [...current.elements, restored],
      components: current.components?.map(definition => ({
        ...definition, members: definition.members.map(item => item.id === member.id && item.referenceId === member.referenceId
          ? {...item, selected: false} : item),
      }))};
    });
    setMessage('Member restored at page scope.');
  }

  async function addNested(parent: ComponentDefinition, collection = false) {
    const child = definitions.find(definition => definition.id === nested);
    if (!child || child.id === parent.id || !child.instances.length) throw Error('Choose a different child definition.');
    const result = await request('POM_COMPONENT_LINK', {settings, multiple: collection,
      parents: parent.instances.flatMap(instance => instance.root.referenceId ? [instance.root.referenceId] : []),
      children: child.instances.flatMap(instance => instance.root.referenceId ? [instance.root.referenceId] : []),
    }) as Pick<ComponentLink, 'locator' | 'observations'> | null;
    if (!result) throw Error('The child root does not resolve within each representative parent.');
    const next: ComponentDefinition = {...parent, children: [...parent.children, {
      name: child.instances[0].name + (collection ? '_items' : ''), definitionId: child.id, ...result, collection,
    }]};
    validateComponentGraph(definitions.map(definition => definition.id === parent.id ? next : definition), model.className);
    save(next);
  }

  function removeDefinition(definition: ComponentDefinition) {
    if (definitions.some(item => item.children.some(link => link.definitionId === definition.id))) {
      setMessage('Remove parent relationships before removing this definition.');
      return;
    }
    edit(current => {
      const remaining = current.components?.filter(item => item.id !== definition.id);
      return {...current, components: remaining, elements: current.elements.map(element =>
        definition.movedRows?.includes(element.id) && !remaining?.some(item => item.movedRows?.includes(element.id))
          ? {...element, selected: true} : element)};
    });
  }

  const root = model.elements.find(element => element.id === rootId);
  return <details>
    <summary>Reusable components ({definitions.length})</summary>
    {versionWarning && <small>Use companion v0.5.0 or later for scoped Playwright validation.</small>}
    <div className="actions">
      <button disabled={busy} onClick={() => void run(async () => {
        const found = await request('POM_COMPONENT_DISCOVER', {settings});
        setSuggestions(Array.isArray(found) ? found : []);
        setMessage(Array.isArray(found) && found.length ? `Found ${found.length} repeated component candidate(s).` :
          'No repeated component candidate was verified in this document.');
      })}>Discover components</button>
      <select aria-label="Component root" value={rootId} onChange={event => setRootId(event.target.value)}>
        <option value="">Use a scanned or inspected element</option>
        {model.elements.filter(element => !element.stale && element.referenceId).map(element =>
          <option key={element.id} value={element.id}>{element.name} · {element.tag}</option>)}
      </select>
      <button disabled={busy || !root?.referenceId} onClick={() =>
        void run(() => define([root!.referenceId!]))}>Define component root</button>
    </div>
    {message && <small role="status">{message}</small>}
    {[...new Map([...(liveSuggestions ?? []).filter(suggestion => !dismissed.includes(suggestion.id)),
      ...suggestions].map(suggestion => [suggestion.id, suggestion])).values()]
      .map(suggestion => <article key={suggestion.id}>
      <strong>{suggestion.title} · {suggestion.instances.length} instances</strong>
      <small>{suggestion.reasons.join(' ')}</small>
      <small>{suggestion.instances.map(instance => instance.key ?? instance.name).join(', ')}</small>
      <button onClick={() => {
        const previous = definitions.find(definition => definition.id === suggestion.id);
        save(previous ? preserveMemberEdits(previous, suggestion) : suggestion);
        setDismissed(items => [...items, suggestion.id]);
        setSuggestions(items => items.filter(item => item.id !== suggestion.id));
      }}>Accept component</button>
      <button onClick={() => {
        setDismissed(items => [...items, suggestion.id]);
        setSuggestions(items => items.filter(item => item.id !== suggestion.id));
      }}>Reject component</button>
    </article>)}
    {definitions.map(definition => <details key={definition.id}>
      <summary>{definition.title} · definition</summary>
      <label>Component name <input type="text" value={definition.title} onChange={event => save({...definition, title: event.target.value})}/></label>
      <label>Component Python class <input type="text" value={definition.className}
        onChange={event => save({...definition, className: event.target.value})}/></label>
      <label><input type="checkbox" checked={definition.exposeInstances !== false}
        onChange={event => save({...definition, exposeInstances: event.target.checked})}/> Expose instances on page</label>
      <div className="actions">
        <button onClick={() => void run(async () => {
          const highlighted = await request('POM_COMPONENT_HIGHLIGHT', {references: definition.instances.slice(0, 12).flatMap(instance =>
            instance.root.referenceId ? [instance.root.referenceId] : [])});
          if (!highlighted) throw Error('Component roots are unavailable.');
        })}>Highlight component roots</button>
        <button disabled={busy} onClick={() => void run(() => define(definition.instances.flatMap(instance =>
          instance.root.referenceId ? [instance.root.referenceId] : []), definition))}>Recheck structure</button>
        <button onClick={() => move(definition)}>Move matching page elements into component</button>
        <button disabled={busy || !root?.referenceId || definition.instances.some(instance => instance.root.referenceId === root?.referenceId)}
          onClick={() => void run(() => define([...definition.instances.flatMap(instance =>
            instance.root.referenceId ? [instance.root.referenceId] : []), root!.referenceId!], definition))}>Add selected root as instance</button>
        {validate && <button onClick={() => validate(runtimeJobs(definition))}>Validate component with Playwright</button>}
      </div>
      {definition.collection && <>
        <small>Collection · {definition.collection.count} observed matches · {pythonLocator(definition.collection.locator)}</small>
        {definition.collection.parameter && <label>Collection lookup parameter
          <input type="text" value={definition.collection.parameter.name} onChange={event => save({...definition,
            collection: {...definition.collection!, parameter: {name: event.target.value, role: 'heading'}}})}/>
        </label>}
      </>}
      <details>
        <summary>Instances ({definition.instances.length})</summary>
        {definition.instances.map(instance => <article key={instance.id}>
          {instance.root.stale && <small>Component instance unavailable in this application state.</small>}
          <label>Instance name <input type="text" value={instance.name} onChange={event => save({...definition,
            instances: definition.instances.map(item => item.id === instance.id ? {...item, name: event.target.value} : item)})}/></label>
          <small>{instance.key}</small>
          <select aria-label="Instance locator" value={instance.root.choice ?? ''} onChange={event => save({...definition,
            instances: definition.instances.map(item => item.id === instance.id ?
              {...item, root: {...item.root, choice: event.target.value || null}} : item)})}>
            <option value="">{componentRootCandidate({...instance.root, choice: null})
              ? 'Automatic root locator' : 'Choose a unique root locator'}</option>
            {instance.root.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
              {candidate.basis} · {candidate.validation.status}
            </option>)}
          </select>
          <button onClick={() => highlight(instance.root)}>Highlight instance</button>
          <button disabled={busy || definition.instances.length < 2} onClick={() => void run(() => define(
            definition.instances.flatMap(item => item.id !== instance.id && item.root.referenceId ? [item.root.referenceId] : []), definition))}>
            Remove instance
          </button>
        </article>)}
      </details>
      <details>
        <summary>Members ({definition.members.length})</summary>
        {definition.members.map(member => <ComponentRow key={member.id} member={member} definition={definition}
          update={patch => save({...definition, members: definition.members.map(item => item.id === member.id ? {...item, ...patch} : item)})}
          restore={() => void run(() => restore(member))}
          highlight={() => highlight(member)}/>)}
      </details>
      <details>
        <summary>Nested components ({definition.children.length})</summary>
        {definition.children.map((link, index) => <div key={link.name}>
          <small>{link.name} · {pythonLocator(link.locator)}</small>
          <button onClick={() => save({...definition, children: definition.children.filter((_, i) => i !== index)})}>Remove relationship</button>
        </div>)}
        <select aria-label="Nested definition" value={nested} onChange={event => setNested(event.target.value)}>
          <option value="">Choose a component definition</option>
          {definitions.filter(item => item.id !== definition.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button disabled={busy || !nested} onClick={() => void run(() => addNested(definition))}>Add nested instance</button>
        <button disabled={busy || !nested} onClick={() => void run(() => addNested(definition, true))}>Add nested collection</button>
      </details>
      {!!definition.runtime?.length && <details>
        <summary>Playwright component evidence</summary>
        {definition.runtime.map(report => <RuntimeReport key={report.instanceId + (report.memberId ?? '') + report.evidence.candidateId}
          definition={definition} report={report}/>)}
      </details>}
      <button onClick={() => removeDefinition(definition)}>Remove component definition</button>
    </details>)}
  </details>;
}

function RuntimeReport({definition, report}: {definition: ComponentDefinition; report: ComponentRuntimeReport}) {
  const evidence = report.evidence;
  const instance = definition.instances.find(item => item.id === report.instanceId);
  const member = definition.members.find(item => item.id === report.memberId);
  const label = report.expectedCount !== undefined
    ? `${report.relationship ?? 'Collection'} count ${evidence.count ?? 'unknown'} / ${report.expectedCount}`
    : `${instance?.name ?? 'Instance'} · ${member?.name ?? report.relationship ?? 'Root'} · ${evidence.status} · ${evidence.count ?? 'unknown'} matches`;
  return <small>Playwright · {currentEvidence(evidence) ? 'Current' : 'Historical'} · {label} · identity {evidence.identity}
    {evidence.rootCount !== undefined && ` · root ${evidence.rootCount}, ${evidence.rootIdentity}`} · {evidence.durationMs} ms</small>;
}

function ComponentRow({member, definition, update, restore, highlight}: {
  member: ComponentMember; definition: ComponentDefinition; update: (patch: Partial<ComponentMember>) => void;
  restore: () => void; highlight: () => void;
}) {
  const candidate = memberCandidate(member, definition.runtime);
  return <article>
    <label><input type="checkbox" checked={member.selected} onChange={event => update({selected: event.target.checked})}/> {member.label}</label>
    <label>Member name <input type="text" value={member.name} onChange={event => update({name: event.target.value})}/></label>
    <label><input type="checkbox" checked={member.optional} onChange={event => update({optional: event.target.checked})}/> Optional member</label>
    <select aria-label="Member interaction" value={member.action} onChange={event => update({action: event.target.value as ElementModel['action']})}>
      {['assert', 'read', 'click', 'fill', 'check', 'select'].map(action => <option key={action}>{action}</option>)}
    </select>
    <select aria-label="Relative locator" value={member.choice ?? ''} onChange={event => update({choice: event.target.value || null})}>
      <option value="">Automatic relative locator</option>
      {member.choice && !candidate && <option value={member.choice}>Previous choice unavailable</option>}
      {member.candidates.map(item => <option key={item.id} value={item.id}>{item.basis} · {item.validation.status}</option>)}
    </select>
    {candidate && <small><code>root.{pythonLocator(candidate.locator, 'root.page')}</code></small>}
    {candidate && member.observations.map(observation => {
      const result = observation.checks[candidate.id];
      const state = result?.status === 'no-match' ? (member.optional ? 'Optional / absent' : 'Missing required') : result?.status;
      return <small key={observation.instanceId}>{definition.instances.find(instance => instance.id === observation.instanceId)?.name}
        {' · '}{state ?? 'unverified'}{' · '}{result?.method ?? 'none'}</small>;
    })}
    <button onClick={highlight}>Highlight member</button>
    <button onClick={restore}>Move member back to page</button>
  </article>;
}
