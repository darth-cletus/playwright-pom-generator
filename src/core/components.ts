import {locatorIsValid, locatorKey, selectedCandidate, type Candidate, type Locator, type Validation} from './locator';
import type {ElementModel} from './model';
import {identifier, reserved} from './python-names';
import {currentEvidence, runtimeRejects, type RuntimeEvidence} from './runtime';

export const modelSchemaVersion = 2;
export const componentDepthLimit = 4;

export interface ComponentMember extends ElementModel {
  optional: boolean;
  observations: {instanceId: string; referenceId?: string; checks: Record<string, Validation>}[];
}

export interface ComponentInstance {
  id: string;
  name: string;
  root: ElementModel;
  key?: string;
}

export interface ComponentCollection {
  locator: Locator;
  count: number;
  parameter?: {name: string; role: 'heading'};
}

export interface ComponentLink {
  name: string;
  definitionId: string;
  locator: Locator;
  collection: boolean;
  observations?: {parentReference: string; childReferences: string[]}[];
}

export interface ComponentDefinition {
  id: string;
  title: string;
  className: string;
  signature: string[];
  confidence: number;
  reasons: string[];
  members: ComponentMember[];
  instances: ComponentInstance[];
  collection?: ComponentCollection;
  children: ComponentLink[];
  exposeInstances?: boolean;
  movedRows?: string[];
  runtime?: ComponentRuntimeReport[];
}

export interface ComponentRuntimeReport {
  instanceId: string;
  memberId?: string;
  relationship?: string;
  expectedCount?: number;
  evidence: RuntimeEvidence;
}

export function parameterLocator(definition: ComponentDefinition, instance: ComponentInstance): Locator | undefined {
  const collection = definition.collection;
  return collection?.parameter && instance.key ? {
    strategy: 'filter', base: collection.locator, has: {strategy: 'role', role: collection.parameter.role, name: instance.key},
  } : undefined;
}

export function componentRootCandidate(root: ElementModel): Candidate | undefined {
  return selectedCandidate(root.choice ? root : {
    ...root, candidates: root.candidates.filter(candidate => candidate.basis !== 'Structural fallback'),
  });
}

export const pythonModule = (value: string) => identifier(value.replace(/([a-z0-9])([A-Z])/g, '$1_$2'));

export function signatureSimilarity(first: readonly string[], second: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const feature of first) counts.set(feature, (counts.get(feature) ?? 0) + 1);
  let overlap = 0;
  for (const feature of second) {
    const count = counts.get(feature) ?? 0;
    if (count > 0) {overlap++; counts.set(feature, count - 1);}
  }
  return first.length + second.length ? 2 * overlap / (first.length + second.length) : 0;
}

export function memberCandidate(member: ComponentMember, reports: readonly ComponentRuntimeReport[] = []): Candidate | undefined {
  if (member.choice) return member.candidates.find(candidate => candidate.id === member.choice);
  const current = reports.filter(report => report.memberId === member.id && currentEvidence(report.evidence));
  return member.candidates.filter(candidate => !current.some(report => report.evidence.candidateId === candidate.id &&
    (report.evidence.rootIdentity === 'wrong' || (runtimeRejects(report.evidence) && !(member.optional &&
      report.evidence.status === 'no-match' &&
      member.observations.some(observation => observation.instanceId === report.instanceId && !observation.referenceId))))) &&
    member.observations.some(observation =>
    observation.checks[candidate.id]?.status === 'unique-target') &&
    member.observations.every(observation => {
      const status = observation.checks[candidate.id]?.status;
      return status === 'unique-target' || (member.optional && status === 'no-match');
    })).sort((left, right) => right.score - left.score ||
      current.filter(report => report.evidence.candidateId === right.id && report.evidence.status === 'unique-target').length -
      current.filter(report => report.evidence.candidateId === left.id && report.evidence.status === 'unique-target').length)[0];
}

export function pythonClassName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value) && !reserved.has(value) && !['Page', 'Locator'].includes(value);
}

export function validateComponentGraph(definitions: readonly ComponentDefinition[], pageClass?: string): void {
  if (definitions.length > 40) throw Error('A page model supports up to 40 component definitions.');
  const ids = new Set(definitions.map(definition => definition.id));
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  if (ids.size !== definitions.length) throw Error('Component IDs must be unique.');
  const classes = new Set(pageClass ? [pageClass] : []);
  const files = new Set<string>();
  const instanceNames = new Set<string>();
  const instanceIds = new Set<string>();
  const depths = new Map<string, number>();
  function visit(definition: ComponentDefinition, stack: readonly string[]): number {
    if (stack.includes(definition.id)) throw Error('Circular component relationship.');
    if (stack.length >= componentDepthLimit) throw Error('Component nesting exceeds the supported depth.');
    const cached = depths.get(definition.id);
    if (cached !== undefined) return cached;
    let depth = 1;
    for (const child of definition.children) {
      const dependency = byId.get(child.definitionId);
      if (!dependency) throw Error('Component relationship references a missing definition.');
      if (!locatorIsValid(child.locator)) throw Error('Invalid relative component root.');
      depth = Math.max(depth, 1 + visit(dependency, [...stack, definition.id]));
    }
    if (depth > componentDepthLimit) throw Error('Component nesting exceeds the supported depth.');
    depths.set(definition.id, depth);
    return depth;
  }
  for (const definition of definitions) {
    const className = definition.className.trim();
    const filename = pythonModule(className);
    if (!pythonClassName(className) || classes.has(className) || files.has(filename)) throw Error('Use unique, valid component class names.');
    classes.add(className);
    files.add(filename);
    if (!definition.instances.length) throw Error('Each component needs a representative instance.');
    const keys = definition.instances.flatMap(instance => instance.key ? [instance.key] : []);
    if (definition.collection?.parameter && new Set(keys).size !== keys.length) throw Error('Component instance keys must be unique.');
    if (definition.collection && (!locatorIsValid(definition.collection.locator) || definition.collection.count < 1)) {
      throw Error('Invalid component collection locator.');
    }
    const parameter = definition.collection?.parameter;
    if (parameter && (identifier(parameter.name) !== parameter.name || ['self', 'index'].includes(parameter.name))) {
      throw Error('Use a valid collection parameter name.');
    }
    const names = [...definition.members.map(member => member.id), ...definition.children.map(child => child.name)];
    if (new Set(names).size !== names.length) throw Error('Duplicate component member identifiers.');
    for (const member of definition.members) {
      if (member.observations.length !== definition.instances.length ||
        new Set(member.observations.map(observation => observation.instanceId)).size !== definition.instances.length) {
        throw Error('A component member needs one observation per representative instance.');
      }
      if (member.observations.some(observation => !definition.instances.some(instance => instance.id === observation.instanceId))) {
        throw Error('Component observation references a missing instance.');
      }
      if (member.candidates.some(candidate => !locatorIsValid(candidate.locator))) throw Error('Invalid component member locator.');
    }
    for (const instance of definition.instances) {
      const name = identifier(instance.name);
      if (instanceIds.has(instance.id) || instanceNames.has(name)) throw Error('Component instances must have unique names and IDs.');
      if (instance.root.candidates.some(candidate => !locatorIsValid(candidate.locator))) throw Error('Invalid component instance locator.');
      instanceNames.add(name);
      instanceIds.add(instance.id);
    }
    visit(definition, []);
  }
}

export function preserveMemberEdits(current: ComponentDefinition, fresh: ComponentDefinition): ComponentDefinition {
  const selection = new Map(current.members.map(member => [member.id, member]));
  const members = fresh.members.map(member => {
    const previous = selection.get(member.id);
    if (!previous) return member;
    const choice = previous.candidates.find(candidate => candidate.id === previous.choice);
    const next = choice && member.candidates.find(candidate => locatorKey(candidate.locator) === locatorKey(choice.locator));
    return {...member, name: previous.name, action: previous.action, selected: previous.selected,
      optional: previous.optional, choice: next?.id ?? previous.choice};
  });
  const byId = new Map(members.map(member => [member.id, member]));
  const ordered = current.members.flatMap(member => {
    const updated = byId.get(member.id);
    byId.delete(member.id);
    return updated ? [updated] : [];
  });
  return {...fresh, id: current.id, className: current.className, title: current.title, children: current.children,
    exposeInstances: current.exposeInstances,
    movedRows: current.movedRows,
    runtime: current.runtime?.filter(report => fresh.instances.some(instance => instance.id === report.instanceId))
      .map(report => ({...report, evidence: {...report.evidence, freshness: 'historical'}})),
    collection: fresh.collection ? {...fresh.collection, parameter: current.collection?.parameter} : undefined,
    instances: fresh.instances.map(instance => {
      const previous = current.instances.find(item => item.id === instance.id);
      return previous ? {...instance, name: previous.name, key: previous.key, root: {...instance.root, choice: previous.root.choice}} : instance;
    }),
    members: [...ordered, ...byId.values()]};
}
