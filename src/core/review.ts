import {locatorIsValid, locatorKey, selectedCandidate, type Locator} from './locator';
import {supportsSchema, type PageModel} from './model';
import {validateComponentGraph} from './components';
import {readContextPath} from './context';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export interface SourceEntry {id: string; name: string; className: string; line: number; editable: boolean; locator: Locator;
  dependencies: string[]}
export interface SourceAnalysis {
  revision: string;
  entries: SourceEntry[];
  classes: {name: string; line: number; bases: string[]}[];
  diagnostics: {line: number; code: 'unsupported-locator'}[];
}

export function readAnalysis(value: unknown): SourceAnalysis {
  const strings = (list: unknown) => Array.isArray(list) && list.every(item => typeof item === 'string');
  if (!record(value) || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision) ||
    !Array.isArray(value.classes) || !Array.isArray(value.entries) || value.entries.length > 2000 ||
    !Array.isArray(value.diagnostics) || value.diagnostics.length > 100 || !value.diagnostics.every(item =>
      record(item) && item.code === 'unsupported-locator' && Number.isSafeInteger(item.line)) ||
    !value.classes.every(entry => record(entry) && typeof entry.name === 'string' && Number.isSafeInteger(entry.line) &&
      strings(entry.bases)) ||
    !value.entries.every(entry => record(entry) && ['id', 'name', 'className'].every(key => typeof entry[key] === 'string') &&
      typeof entry.editable === 'boolean' && Number.isSafeInteger(entry.line) && strings(entry.dependencies) &&
      locatorIsValid(entry.locator as Locator))) {
    throw Error('Invalid source analysis response.');
  }
  return value as unknown as SourceAnalysis;
}

export function readPageModel(text: string): PageModel {
  if (text.length > 1_000_000) throw Error('Choose a JSON model under 1 MB.');
  const transient = new Set(['referenceId', 'documentKey', 'requestId', 'browserId', 'runtime', 'applicationRevision',
    'scopeKey', 'parentReference', 'childReferences', '__proto__', 'prototype', 'constructor']);
  const value: unknown = JSON.parse(text, (key, item) => transient.has(key) ? undefined : item);
  const isContext = (context: unknown) => record(context) && Array.isArray(context.path) &&
    ['accessible', 'ambiguous', 'unavailable'].includes(String(context.state)) &&
    readContextPath(context.path.map(step => record(step) && step.owner === undefined && context.state !== 'accessible'
      ? {...step, owner: {strategy: 'css', selector: '*'}} : step)) !== undefined;
  const isElement = (row: unknown) => record(row) && ['id', 'name', 'label', 'tag'].every(key => typeof row[key] === 'string') &&
    ['click', 'fill', 'check', 'select', 'read', 'assert'].includes(String(row.action)) &&
    typeof row.selected === 'boolean' && (row.choice === null || typeof row.choice === 'string') &&
    (row.context === undefined || isContext(row.context)) &&
    Array.isArray(row.candidates) && row.candidates.length <= 100 && row.candidates.every(candidate =>
      record(candidate) && locatorIsValid(candidate.locator as Locator) && typeof candidate.id === 'string' &&
      typeof candidate.basis === 'string' && Number.isFinite(candidate.score) && Array.isArray(candidate.warnings) &&
      Array.isArray(candidate.explanations) && record(candidate.validation) &&
      ['unique-target', 'ambiguous', 'no-match', 'wrong-target', 'unvalidated', 'error'].includes(String(candidate.validation.status)));
  if (!record(value) || !supportsSchema(value.schemaVersion as number | undefined) ||
    typeof value.url !== 'string' || typeof value.className !== 'string' || !Array.isArray(value.elements) ||
    value.elements.length > 3000 || !value.elements.every(isElement) ||
    new Set(value.elements.map(row => row.id)).size !== value.elements.length ||
    (value.contexts !== undefined && (!Array.isArray(value.contexts) || !value.contexts.every(isContext)))) {
    throw Error('Unsupported or malformed Page Object Generator JSON.');
  }
  const page = value as unknown as PageModel;
  if (page.components !== undefined) {
    if (!Array.isArray(page.components) || !page.components.every(component => record(component) &&
      Array.isArray(component.instances) && component.instances.every(instance => record(instance) && isElement(instance.root)) &&
      Array.isArray(component.members) && component.members.every(member => isElement(member) && Array.isArray(member.observations)) &&
      Array.isArray(component.children) && component.children.every(child => record(child) && locatorIsValid(child.locator)) &&
      (!component.collection || locatorIsValid(component.collection.locator)))) throw Error('Malformed reusable component model.');
    validateComponentGraph(page.components, page.className);
  }
  return page;
}

export function assess(entry: SourceEntry, model: PageModel | null) {
  const key = locatorKey(entry.locator);
  const observed = (model?.elements ?? []).filter(row => !row.stale && row.referenceId);
  const evidence = observed.flatMap(row => row.candidates.filter(candidate => locatorKey(candidate.locator) === key));
  const matching = observed.filter(row => row.name === entry.name || row.name === entry.name.replace(/^_/, ''));
  const replacement = matching.length === 1 ? selectedCandidate(matching[0]) : undefined;
  const supported = !evidence.some(candidate => candidate.validation.status === 'unique-target') &&
    !matching[0]?.context && entry.locator.strategy !== 'chain' && entry.locator.strategy !== 'frame' &&
    replacement && replacement.validation.status === 'unique-target' &&
    locatorKey(replacement.locator) !== key ? replacement.locator : undefined;
  return {status: evidence.some(candidate => candidate.validation.status === 'ambiguous') ? 'Ambiguous' :
    evidence.some(candidate => candidate.validation.status === 'unique-target') ? 'Observed unique' : 'Unverified',
    replacement: supported};
}
