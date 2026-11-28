import {reserved} from './python-names';

export interface GenerationDependency {name: string; module: string; type: string}
export interface GenerationStep {
  elementId: string;
  action: 'click' | 'dblclick' | 'fill' | 'clear' | 'press' | 'check' | 'uncheck' | 'select' | 'upload' | 'read' | 'assert';
  argument?: string;
  defaultValue?: string;
  expectedText?: string;
  key?: 'Enter' | 'Escape';
}
export interface GenerationMethod {name: string; steps: GenerationStep[]}

export interface GenerationOptions {
  execution: 'sync' | 'async';
  pythonMinor: 10 | 11 | 12 | 13;
  annotations: 'legacy' | 'typed' | 'none';
  declaration: 'constructor' | 'property' | 'method';
  selectorConstants: boolean;
  interactions: boolean;
  documentation: boolean;
  assertions: boolean;
  memberPrefix: string;
  methodPrefix: string;
  methodOrder: 'action-first' | 'member-first';
  baseModule: string;
  baseClass: string;
  superPage: boolean;
  componentBaseModule: string;
  componentBaseClass: string;
  superRoot: boolean;
  forwardBaseDependencies: boolean;
  dependencies: GenerationDependency[];
  logger: string;
  methods: GenerationMethod[];
  packageName: string;
  pagesDirectory: string;
  componentsDirectory: string;
  pageModule: string;
  packageImports: 'relative' | 'absolute';
  navigationPath: string;
  timeoutMs: number;
  indent: 2 | 4;
  lineEnding: 'lf' | 'crlf';
  header: string;
}

export interface GenerationProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  revision: number;
  options: GenerationOptions;
}

export const defaultGeneration: GenerationOptions = {
  execution: 'sync', pythonMinor: 13, annotations: 'legacy', declaration: 'constructor', selectorConstants: false,
  interactions: true, documentation: false,
  assertions: false, memberPrefix: '', methodPrefix: '', methodOrder: 'action-first', baseModule: '', baseClass: '',
  superPage: false, componentBaseModule: '', componentBaseClass: '', superRoot: false, forwardBaseDependencies: false,
  dependencies: [], logger: '', methods: [],
  packageName: 'generated', pagesDirectory: 'pages', componentsDirectory: 'components', pageModule: '', packageImports: 'relative',
  navigationPath: '', timeoutMs: 0, indent: 4, lineEnding: 'lf', header: '',
};

function preset(id: string, name: string, description: string, overrides: Partial<GenerationOptions> = {}): GenerationProfile {
  return {schemaVersion: 1, id, name, description, revision: 1, options: {...defaultGeneration, ...overrides}};
}

export const generationProfiles = [
  preset('sync', 'Basic synchronous', 'The original synchronous Python output.'),
  preset('typed-sync', 'Typed synchronous', 'Typed locators and documented synchronous methods.', {annotations: 'typed', documentation: true}),
  preset('async', 'Basic asynchronous', 'Async Playwright actions with lazy locator factories.', {execution: 'async'}),
  preset('typed-async', 'Typed asynchronous', 'Async Playwright with typed properties and assertions.',
    {execution: 'async', annotations: 'typed', declaration: 'property', assertions: true}),
  preset('components', 'Component package', 'Typed reusable components in a dedicated package.',
    {annotations: 'typed', packageName: 'page_objects', documentation: true}),
  preset('framework', 'Framework integration example', 'Example base class, constructor forwarding and package layout.',
    {baseModule: 'framework.base', baseClass: 'BasePage', superPage: true, componentBaseModule: 'framework.base',
      componentBaseClass: 'BaseComponent', superRoot: true, packageName: 'automation', annotations: 'typed',
      dependencies: [{name: 'logger', module: 'logging', type: 'Logger'}], logger: 'logger', memberPrefix: '_'}),
] as const;

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const symbol = (value: string) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value) && !reserved.has(value) && value !== '__debug__';
const moduleName = (value: string) => value.length <= 160 && value.split('.').every(symbol);
const bareKeyword = new Set(['type', 'async', 'await', 'match', 'case']);
const packageIdentifier = (value: string) => /^[a-z_][a-z0-9_]{0,63}$/.test(value) && symbol(value) && !bareKeyword.has(value);

export function resolveGeneration(...layers: Partial<GenerationOptions>[]): GenerationOptions {
  const options = {...defaultGeneration};
  for (const layer of layers) {
    if (!object(layer) || Object.keys(layer).some(key => !Object.hasOwn(defaultGeneration, key))) throw Error('Unsupported generation option.');
    Object.assign(options, layer);
  }
  const modes = {execution: ['sync', 'async'], annotations: ['legacy', 'typed', 'none'],
    declaration: ['constructor', 'property', 'method'], methodOrder: ['action-first', 'member-first'],
    lineEnding: ['lf', 'crlf'], indent: [2, 4], packageImports: ['relative', 'absolute'], pythonMinor: [10, 11, 12, 13]} as const;
  for (const [key, allowed] of Object.entries(modes)) {
    if (!(allowed as readonly unknown[]).includes(options[key as keyof GenerationOptions])) throw Error('Invalid generation option ' + key + '.');
  }
  for (const key of ['interactions', 'documentation', 'assertions', 'selectorConstants', 'superPage', 'superRoot', 'forwardBaseDependencies'] as const) {
    if (typeof options[key] !== 'boolean') throw Error('Invalid generation option ' + key + '.');
  }
  for (const key of ['packageName', 'pagesDirectory', 'componentsDirectory'] as const) {
    if (typeof options[key] !== 'string' || !packageIdentifier(options[key])) throw Error('Use a safe Python package name for ' + key + '.');
  }
  if (options.pagesDirectory === options.componentsDirectory) throw Error('Use different page and component directories.');
  if (typeof options.pageModule !== 'string' || (options.pageModule &&
    (!packageIdentifier(options.pageModule) || options.pageModule === '__init__'))) throw Error('Use a safe page module name.');
  if (options.packageName === 'playwright') throw Error('The output package must not shadow Playwright.');
  for (const key of ['memberPrefix', 'methodPrefix'] as const) {
    if (typeof options[key] !== 'string' || (options[key] && (!/^[a-z_][a-z0-9_]{0,31}$/.test(options[key]) || options[key].startsWith('__')))) {
      throw Error('Use a lowercase Python identifier for ' + key + '.');
    }
  }
  for (const [type, module, forward] of [[options.baseClass, options.baseModule, options.superPage],
    [options.componentBaseClass, options.componentBaseModule, options.superRoot]] as const) {
    if (typeof type !== 'string' || typeof module !== 'string' || Boolean(type) !== Boolean(module) ||
      (type && (!symbol(type) || !moduleName(module))) || (forward && !type)) {
      throw Error('Provide a valid base class and dotted import module before forwarding its constructor argument.');
    }
  }
  if (!Array.isArray(options.dependencies) || options.dependencies.length > 8 ||
    options.dependencies.some(dependency => !object(dependency) || typeof dependency.name !== 'string' ||
      !/^[a-z][a-z0-9_]{0,31}$/.test(dependency.name) || !symbol(dependency.name) || dependency.name === 'root' ||
      typeof dependency.module !== 'string' || !moduleName(dependency.module) ||
      typeof dependency.type !== 'string' || !symbol(dependency.type)) ||
    new Set(options.dependencies.map(item => item.name)).size !== options.dependencies.length ||
    typeof options.logger !== 'string' || (options.logger && !options.dependencies.some(item => item.name === options.logger))) {
    throw Error('Configure distinct constructor dependencies and select a declared logger.');
  }
  options.dependencies = options.dependencies.map(({name, module, type}) => ({name, module, type}));
  if (options.forwardBaseDependencies && (!options.dependencies.length || (!options.superPage && !options.superRoot))) {
    throw Error('Configure constructor forwarding and dependencies before forwarding dependencies to a base.');
  }
  if (!Array.isArray(options.methods) || options.methods.length > 30 || options.methods.some(method =>
    !object(method) || typeof method.name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(method.name) || !symbol(method.name) ||
    !Array.isArray(method.steps) || !method.steps.length || method.steps.length > 250 || method.steps.some((step, index) => {
      if (!object(step) || typeof step.elementId !== 'string' || !step.elementId || step.elementId.length > 160 ||
        !['click', 'dblclick', 'fill', 'clear', 'press', 'check', 'uncheck', 'select', 'upload', 'read', 'assert'].includes(String(step.action)) ||
        (step.action === 'read' && index !== method.steps.length - 1)) return true;
      if (step.expectedText !== undefined && (step.action !== 'assert' || typeof step.expectedText !== 'string' ||
        step.expectedText.length > 200)) return true;
      if (step.action === 'press' ? step.key !== 'Enter' && step.key !== 'Escape' : step.key !== undefined) return true;
      if (step.action !== 'fill' && step.action !== 'select' && step.action !== 'upload') {
        return step.argument !== undefined || step.defaultValue !== undefined;
      }
      if (step.action === 'upload' && step.defaultValue !== undefined) return true;
      return typeof step.argument !== 'string' || !symbol(step.argument) || (step.defaultValue !== undefined &&
        (typeof step.defaultValue !== 'string' || step.defaultValue.length > 200));
    }))) throw Error('Use named methods with supported steps, selected element IDs, and explicit fill or select parameters.');
  if (new Set(options.methods.map(item => item.name)).size !== options.methods.length) throw Error('Use distinct configured method names.');
  if (options.methods.reduce((total, method) => total + method.steps.length, 0) > 600) {
    throw Error('Use at most 600 action steps across configured methods.');
  }
  if (options.methods.some(method => options.dependencies.some(dependency => dependency.name === method.name))) {
    throw Error('A configured method conflicts with a constructor dependency.');
  }
  if (!options.assertions && options.methods.some(method => method.steps.some(step => step.action === 'assert'))) {
    throw Error('Enable assertions before adding assertion steps.');
  }
  options.methods = options.methods.map(({name, steps}) => ({name,
    steps: steps.map(({elementId, action, argument, defaultValue, expectedText, key}) =>
      ({elementId, action, argument, defaultValue, expectedText, ...(key ? {key} : {})}))}));
  if (typeof options.navigationPath !== 'string' || (options.navigationPath &&
    (!/^\/(?!\/)[^?#\\\s]{0,255}$/.test(options.navigationPath) || /[\x00-\x1f\x7f]/.test(options.navigationPath)))) {
    throw Error('Enter a relative navigation path such as /checkout.');
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0 || options.timeoutMs > 120000) throw Error('Timeout must be from 0 to 120000 ms.');
  if (typeof options.header !== 'string' || options.header.length > 2000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(options.header) ||
    /\{\{(?!class\}\}|profile\}\})/.test(options.header)) throw Error('Headers accept plain text and {{class}} or {{profile}} placeholders.');
  return options;
}

export function readGenerationProfile(value: unknown): GenerationProfile {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id) ||
    typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
    typeof value.description !== 'string' || value.description.length > 300 ||
    typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
    !object(value.options)) throw Error('Invalid generation profile.');
  return {schemaVersion: 1, id: value.id, name: value.name.trim(), description: value.description,
    revision: value.revision, options: resolveGeneration(value.options)};
}
