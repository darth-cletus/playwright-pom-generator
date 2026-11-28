import {locatorIsValid, locatorKey, selectedCandidate, type Locator} from './locator';
import {supportsSchema, type PageModel} from './model';
import {validateComponentGraph} from './components';
import {readContextPath} from './context';
import type {GenerationOptions} from './generation-profile';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export interface SourceEntry {id: string; name: string; className: string; line: number; editable: boolean; locator: Locator;
  dependencies: string[]}
interface ConstructorContract {
  positionals: string[];
  positionalOnly: number;
  requiredPositionals: number;
  keywords: string[];
  requiredKeywords: string[];
  acceptsArgs: boolean;
  acceptsKeywords: boolean;
}
export interface SourceAnalysis {
  revision: string;
  entries: SourceEntry[];
  classes: {name: string; line: number; bases: string[]; constructor?: ConstructorContract | null}[];
  diagnostics: {line: number; code: 'unsupported-locator'}[];
  generationConventions?: {
    playwrightImports: {execution: 'sync' | 'async'; line: number}[];
    lineEnding: 'crlf' | 'lf';
  };
}

export function readAnalysis(value: unknown): SourceAnalysis {
  const strings = (list: unknown) => Array.isArray(list) && list.every(item => typeof item === 'string');
  const constructor = (value: unknown) => value === null || (record(value) &&
    strings(value.positionals) && strings(value.keywords) && strings(value.requiredKeywords) &&
    Number.isSafeInteger(value.positionalOnly) && Number.isSafeInteger(value.requiredPositionals) &&
    typeof value.acceptsArgs === 'boolean' && typeof value.acceptsKeywords === 'boolean');
  if (!record(value) || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision) ||
    !Array.isArray(value.classes) || !Array.isArray(value.entries) || value.entries.length > 2000 ||
    !Array.isArray(value.diagnostics) || value.diagnostics.length > 100 || !value.diagnostics.every(item =>
      record(item) && item.code === 'unsupported-locator' && Number.isSafeInteger(item.line)) ||
    !value.classes.every(entry => record(entry) && typeof entry.name === 'string' && Number.isSafeInteger(entry.line) &&
      strings(entry.bases) && (!Object.hasOwn(entry, 'constructor') || constructor(entry.constructor))) ||
    !value.entries.every(entry => record(entry) && ['id', 'name', 'className'].every(key => typeof entry[key] === 'string') &&
      typeof entry.editable === 'boolean' && Number.isSafeInteger(entry.line) && strings(entry.dependencies) &&
      locatorIsValid(entry.locator as Locator))) {
    throw Error('Invalid source analysis response.');
  }
  const conventions = value.generationConventions;
  if (conventions !== undefined && (!record(conventions) ||
    (conventions.lineEnding !== 'lf' && conventions.lineEnding !== 'crlf') || !Array.isArray(conventions.playwrightImports) ||
    conventions.playwrightImports.length > 20 || !conventions.playwrightImports.every(entry =>
      record(entry) && (entry.execution === 'sync' || entry.execution === 'async') && Number.isSafeInteger(entry.line)))) {
    throw Error('Invalid source convention response.');
  }
  return value as unknown as SourceAnalysis;
}

export function frameworkCompatibility(options: GenerationOptions, files: {name: string; analysis: SourceAnalysis}[]) {
  function declaration(module: string, name: string) {
    const expected = module.split('.').at(-1) + '.py';
    return files.find(file => file.name === expected)?.analysis.classes.find(item => item.name === name);
  }
  const forwarded = options.forwardBaseDependencies ? options.dependencies.map(item => item.name) : [];
  const findings: {name: string; message: string}[] = [];
  for (const [module, name, forward] of [[options.baseModule, options.baseClass, options.superPage],
    [options.componentBaseModule, options.componentBaseClass, options.superRoot]] as const) {
    if (!name) continue;
    const label = module + '.' + name;
    const source = declaration(module, name);
    const contract = source && Object.hasOwn(source, 'constructor') ? source.constructor : undefined;
    if (!forward || !contract) {
      findings.push({name: label, message: !forward ? 'User-configured contract. The generated constructor does not call the base.' :
        'Unresolved. Select source declaring the base and its direct constructor.'});
      continue;
    }
    const provided = new Set(forwarded);
    const keywordTargets = [...contract.positionals.slice(Math.max(1, contract.positionalOnly)), ...contract.keywords];
    const positionalMissing = contract.positionals.slice(1, contract.requiredPositionals)
      .some((argument, index) => index + 1 < contract.positionalOnly || !provided.has(argument));
    const keywordMissing = contract.requiredKeywords.some(argument => !provided.has(argument));
    const duplicated = contract.positionalOnly === 0 && provided.has(contract.positionals[0]);
    const unexpected = !contract.acceptsKeywords && forwarded.some(argument => !keywordTargets.includes(argument));
    const incompatible = (!contract.positionals.length && !contract.acceptsArgs) || positionalMissing ||
      keywordMissing || duplicated || unexpected;
    findings.push({name: label, message: incompatible ? 'Incompatible with the declared constructor arguments.' :
      'The supplied source signature accepts the configured arguments. Verify installed import resolution separately.'});
  }
  for (const dependency of options.dependencies) {
    findings.push({name: dependency.name, message: declaration(dependency.module, dependency.type) ?
      'A matching type is declared in the selected source.' : 'Unresolved dependency in the selected source. Check the framework import.'});
  }
  return findings;
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
    ['click', 'dblclick', 'fill', 'clear', 'press', 'check', 'uncheck', 'select', 'upload', 'read', 'assert'].includes(String(row.action)) &&
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
