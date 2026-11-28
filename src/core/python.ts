import {locatorIsValid, selectedCandidate, testIdAttributes, type Locator} from './locator';
import {supportsSchema, type PageModel} from './model';
import {identifier, reserved} from './python-names';
import {currentEvidence, runtimeRejects, type RuntimePolicy} from './runtime';
import {componentRootCandidate, memberCandidate, pythonModule, validateComponentGraph, type ComponentDefinition} from './components';
import type {Action} from './model';
import {stableTestId} from './lifecycle';
import {resolveGeneration, type GenerationOptions, type GenerationProfile} from './generation-profile';

export {identifier} from './python-names';

export const quote = (value: string) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function pythonLocator(locator: Locator, page = 'page'): string {
  switch (locator.strategy) {
    case 'css': return `locator(${quote(locator.selector)})`;
    case 'test-id': return `get_by_test_id(${quote(locator.value)})`;
    case 'role': return `get_by_role(${quote(locator.role)}, name=${quote(locator.name)}, exact=True)`;
    case 'alt': return `get_by_alt_text(${quote(locator.value)}, exact=True)`;
    case 'chain': return `${pythonLocator(locator.root, page)}.${pythonLocator(locator.child, page)}`;
    case 'frame': return `${pythonLocator(locator.root, page)}.content_frame.${pythonLocator(locator.child, page)}`;
    case 'filter': return `${pythonLocator(locator.base, page)}.filter(${locator.has
      ? `has=${page}.${pythonLocator(locator.has, page)}` : `has_text=${quote(locator.text ?? '')}`})`;
    case 'index': return `${pythonLocator(locator.base, page)}.nth(${locator.index})`;
    default: return `get_by_${locator.strategy}(${quote(locator.value)}, exact=True)`;
  }
}

type Row = {id: string; name: string; action: Action; locator: Locator};

function names(initial: string[]) {
  const used = new Set(initial);
  return (base: string) => {
    let name = base;
    for (let i = 2; used.has(name); i++) name = base + '_' + i;
    used.add(name);
    return name;
  };
}

const typed = (options: GenerationOptions, type: string) => options.annotations === 'none' ? '' : ': ' + type;
const returns = (options: GenerationOptions, type: string) => options.annotations === 'none' ? '' : ' -> ' + type;
const ioMethod = (options: GenerationOptions) => options.execution === 'async' ? 'async def' : 'def';
const awaited = (options: GenerationOptions) => options.execution === 'async' ? 'await ' : '';
const access = (options: GenerationOptions, name: string) => 'self.' + name + (options.declaration === 'method' ? '()' : '');
const dependencyAlias = (index: number) => '_Dependency' + (index + 1);
const dependencyParameters = (options: GenerationOptions) =>
  options.dependencies.map((dependency, index) => ', ' + dependency.name + typed(options, dependencyAlias(index))).join('');
const dependencyArguments = (options: GenerationOptions) =>
  options.dependencies.map(dependency => ', ' + dependency.name + '=self.' + dependency.name).join('');
const dependencyFields = (options: GenerationOptions) => options.dependencies.map(item => `        self.${item.name} = ${item.name}`);
const dependencyImports = (options: GenerationOptions) => options.annotations === 'none' ? [] :
  options.dependencies.map((item, index) => `from ${item.module} import ${item.type} as ${dependencyAlias(index)}`);
const componentBaseImport = (options: GenerationOptions) => options.componentBaseClass
  ? [`from ${options.componentBaseModule} import ${options.componentBaseClass} as _FrameworkComponent`] : [];
const baseArguments = (options: GenerationOptions) => options.forwardBaseDependencies
  ? options.dependencies.map(item => ', ' + item.name + '=' + item.name).join('') : '';

function declare(lines: string[], declarations: string[], options: GenerationOptions, name: string, locator: string) {
  if (options.declaration === 'constructor') {
    lines.push(`        self.${name}${options.annotations === 'typed' ? ': Locator' : ''} = ${locator}`);
  } else {
    declarations.push('');
    if (options.declaration === 'property') declarations.push('    @property');
    declarations.push(`    def ${name}(self)${returns(options, 'Locator')}:`, `        return ${locator}`);
  }
}

function declaredLocator(options: GenerationOptions, locator: Locator, receiver: string, context: string,
  name: string, constants: string[], unique: (base: string) => string): string {
  if (options.selectorConstants && locator.strategy === 'css') {
    const constant = unique('CSS_' + name.toUpperCase());
    constants.push(`    ${constant} = ${quote(locator.selector)}`);
    return `${receiver}.locator(self.${constant})`;
  }
  return `${receiver}.${pythonLocator(locator, context)}`;
}

function addConstants(lines: string[], constants: string[], options: GenerationOptions) {
  if (constants.length) lines.splice(options.documentation ? 3 : 1, 0, ...constants, '');
}

function operation(options: GenerationOptions, name: string, action: Action, argument?: string, expected?: string) {
  const target = access(options, name);
  if (expected !== undefined) argument = quote(expected);
  const timeout = options.timeoutMs ? (argument ? ', ' : '') + 'timeout=' + options.timeoutMs : '';
  const call = action === 'select' ? 'select_option' : action === 'read' ? 'inner_text' : action;
  const assertion = expected === undefined ? 'to_be_visible' : 'to_have_text';
  const statement = action === 'assert' ? `expect(${target}).${assertion}(${argument ?? ''}${timeout})` :
    `${target}.${call}(${argument ?? ''}${timeout})`;
  return `${action === 'read' ? 'return ' : ''}${awaited(options)}${statement}`;
}

function documentMethod(lines: string[], description: string, parameters: string[], readsText = false) {
  if (!parameters.length && !readsText) {
    lines.push(`        """${description}"""`);
    return;
  }
  lines.push(`        """${description}`);
  if (parameters.length) lines.push('', '        Args:', ...parameters.map(name => `            ${name}: Value supplied by the caller.`));
  if (readsText) lines.push('', '        Returns:', '            The locator text.');
  lines.push('        """');
}

function interactionMethods(lines: string[], rows: readonly Row[], unique: (base: string) => string, options: GenerationOptions) {
  for (const {name, action} of rows) {
    if (action === 'assert' ? !options.assertions : !options.interactions) continue;
    const verb = action === 'assert' ? 'assert_visible' : action;
    const method = unique(options.methodPrefix + (options.methodOrder === 'member-first' ? `${name}_${verb}` : `${verb}_${name}`));
    const needsValue = action === 'fill' || action === 'select';
    const read = action === 'read';
    lines.push('', `    ${ioMethod(options)} ${method}(self${needsValue ? ', value' + typed(options, 'str') : ''})${returns(options, read ? 'str' : 'None')}:`);
    if (options.documentation) documentMethod(lines, `${verb.replaceAll('_', ' ')} using the ${name} locator.`, needsValue ? ['value'] : [], read);
    if (options.logger) lines.push(`        self.${options.logger}.info(${quote(verb + ' ' + name)})`);
    lines.push('        ' + operation(options, name, action, needsValue ? 'value' : undefined));
  }
}

function configuredMethods(lines: string[], rows: readonly Row[], options: GenerationOptions) {
  const targets = new Map(rows.map(row => [row.id, row]));
  for (const method of options.methods) {
    const parameters = new Map<string, string | undefined>();
    const statements = method.steps.map(step => {
      const target = targets.get(step.elementId);
      if (!target || (target.action !== step.action && step.action !== 'assert')) {
        throw Error(`Review the selected target and action in configured method ${method.name}.`);
      }
      if (step.argument) {
        if (parameters.has(step.argument) && parameters.get(step.argument) !== step.defaultValue) {
          throw Error(`Conflicting defaults for ${step.argument} in ${method.name}.`);
        }
        parameters.set(step.argument, step.defaultValue);
      }
      return '        ' + operation(options, target.name, step.action, step.argument, step.expectedText);
    });
    const parametersText = [...parameters].map(([name, value]) =>
      name + typed(options, 'str') + (value === undefined ? '' : ' = ' + quote(value)));
    lines.push('', `    ${ioMethod(options)} ${method.name}(self${parameters.size ? ', *, ' + parametersText.join(', ') : ''})${returns(options,
      method.steps.at(-1)?.action === 'read' ? 'str' : 'None')}:`);
    if (options.documentation) documentMethod(lines, `Run the configured ${method.name} steps.`, [...parameters.keys()],
      method.steps.at(-1)?.action === 'read');
    if (options.logger) lines.push(`        self.${options.logger}.info(${quote(method.name)})`);
    lines.push(...statements);
  }
}

function assertComponentEvidence(definition: ComponentDefinition, instanceId: string, candidateId: string,
  policy: RuntimePolicy, memberId?: string, optionalAbsent = false) {
  const evidence = currentEvidence(definition.runtime?.find(item => item.instanceId === instanceId &&
    item.memberId === memberId && item.evidence.candidateId === candidateId)?.evidence);
  if (evidence && optionalAbsent && evidence.status === 'no-match') return;
  if (runtimeRejects(evidence) || evidence?.rootIdentity === 'wrong') {
    throw Error(`Runtime validation conflicts with ${definition.title}. Review its instance evidence.`);
  }
  if (policy !== 'browser' && evidence?.status !== 'unique-target' &&
    !(policy === 'runtime' && evidence?.status === 'unique-unverified')) {
    throw Error(`Validate the selected locators for ${definition.title} under the current export policy.`);
  }
}

function componentClass(definition: ComponentDefinition, definitions: readonly ComponentDefinition[],
  policy: RuntimePolicy, locators: Locator[], options: GenerationOptions): string {
  const unique = names(['root', 'page', ...options.dependencies.map(item => item.name)]);
  const optionalNames: string[] = [];
  const lines = [`class ${definition.className.trim()}${options.componentBaseClass ? '(_FrameworkComponent)' : ''}:`,
    ...(options.documentation ? ['    """Reusable component with scoped Playwright locators."""', ''] : []),
    `    def __init__(self, root${typed(options, 'Locator')}${dependencyParameters(options)})${returns(options, 'None')}:`];
  if (options.superRoot) lines.push(`        super().__init__(root${baseArguments(options)})`);
  lines.push('        self.root = root', ...dependencyFields(options));
  const declarations: string[] = [];
  const constants: string[] = [];
  const rows: Row[] = [];
  for (const member of definition.members.filter(item => item.selected)) {
    const candidate = memberCandidate(member, definition.runtime);
    if (!candidate || !member.observations.length || !member.observations.every(observation => {
      const result = observation.checks[candidate.id];
      return result?.status === 'unique-target' || (member.optional && result?.status === 'no-match');
    })) throw Error(`Review the relative locator for ${definition.title} / ${member.name}.`);
    for (const observation of member.observations) {
      assertComponentEvidence(definition, observation.instanceId, candidate.id, policy, member.id,
        member.optional && !observation.referenceId);
    }
    const name = unique(options.memberPrefix + identifier(member.name));
    rows.push({id: member.id, name, action: member.action, locator: candidate.locator});
    if (member.optional) optionalNames.push(name);
    locators.push(candidate.locator);
    const receiver = options.declaration === 'constructor' ? 'root' : 'self.root';
    declare(lines, declarations, options, name,
      declaredLocator(options, candidate.locator, receiver, receiver + '.page', name, constants, unique));
  }
  const nestedMethods: string[] = [];
  for (const link of definition.children) {
    for (const instance of definition.instances) {
      const candidateId = 'relationship-' + link.name;
      if (!link.collection) assertComponentEvidence(definition, instance.id, candidateId, policy);
      else {
        const report = definition.runtime?.find(item => item.instanceId === instance.id && item.evidence.candidateId === candidateId);
        const evidence = currentEvidence(report?.evidence);
        if (evidence?.rootIdentity === 'wrong' || (policy !== 'browser' &&
          (!evidence || evidence.rootIdentity !== 'confirmed' || evidence.count !== report?.expectedCount))) {
          throw Error(`Review nested collection validation for ${definition.title}.`);
        }
      }
    }
    const target = definitions.find(item => item.id === link.definitionId)!;
    const className = target.className.trim();
    const name = unique(identifier(link.name));
    const locator = `root.${pythonLocator(link.locator, 'root.page')}`;
    locators.push(link.locator);
    if (link.collection) {
      lines.push(`        self.${name} = ${locator}`);
      const method = unique('get_' + name + '_at');
      nestedMethods.push('', `    def ${method}(self, index${typed(options, 'int')})${returns(options, className)}:`,
        `        return ${className}(self.${name}.nth(index)${dependencyArguments(options)})`);
    } else lines.push(`        self.${name} = ${className}(${locator}${dependencyArguments(options)})`);
  }
  lines.push(...declarations);
  for (const name of optionalNames) lines.push('', `    ${ioMethod(options)} ${unique('has_' + name)}(self)${returns(options, 'bool')}:`,
    `        return ${awaited(options)}${access(options, name)}.count() == 1`);
  interactionMethods(lines, rows, unique, options);
  addConstants(lines, constants, options);
  return [...lines, ...nestedMethods].join('\n');
}

function render(model: PageModel, policy: RuntimePolicy, options: GenerationOptions) {
  const className = model.className.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(className) || reserved.has(className)) {
    throw Error('Invalid Python class name');
  }
  const definitions = model.components ?? [];
  if (model.elements.length > 3000 || definitions.length > 100) throw Error('The page model exceeds generation limits.');
  const reservedImports = new Set(['Page', 'Locator', 'expect', '_FrameworkBase', '_FrameworkComponent', '__debug__',
    ...options.dependencies.map((_, index) => dependencyAlias(index))]);
  if (reservedImports.has(className) || definitions.some(definition => reservedImports.has(definition.className.trim()))) {
    throw Error('Use class names distinct from generated imports.');
  }
  if (!supportsSchema(model.schemaVersion)) {
    throw Error('Unsupported page object schema version.');
  }
  validateComponentGraph(definitions, className);
  const unique = names(['page', 'navigate', 'PATH', ...options.dependencies.map(item => item.name), ...options.methods.map(item => item.name)]);
  const rows = model.elements.filter(element => element.selected).map(element => {
    const candidate = selectedCandidate(element);
    const lazyUnavailable = policy === 'browser' && element.availability === 'unavailable' && stableTestId(candidate);
    if (element.stale && !lazyUnavailable) throw Error(`Review the detached or unavailable element ${element.name}, or deselect it.`);
    const evidence = currentEvidence(candidate?.runtime);
    if (runtimeRejects(evidence)) {
      throw Error(`Playwright found ${evidence?.status} for ${element.name}. Choose another locator or validate again.`);
    }
    if (policy !== 'browser' && evidence?.status !== 'unique-target' &&
      !(policy === 'runtime' && evidence?.status === 'unique-unverified')) {
      throw Error(`Validate the locator for ${element.name} under the selected runtime policy.`);
    }
    if (!candidate || (candidate.validation.status !== 'unique-target' && evidence?.status !== 'unique-target')) {
      throw Error(`Choose a locator that uniquely matches ${element.name}`);
    }
    return {id: element.id, name: unique(options.memberPrefix + identifier(element.name)), action: element.action, locator: candidate.locator};
  });
  const locators = rows.map(row => row.locator);
  const componentSources = definitions.map(definition => ({definition, body: componentClass(definition, definitions, policy, locators, options)}));
  const lines = [`class ${className}${options.baseClass ? '(_FrameworkBase)' : ''}:`,
    ...(options.documentation ? ['    """Page object with Playwright locators."""', ''] : []),
    `    def __init__(self, page${typed(options, 'Page')}${dependencyParameters(options)})${returns(options, 'None')}:`];
  if (options.superPage) lines.push(`        super().__init__(page${baseArguments(options)})`);
  lines.push('        self.page = page', ...dependencyFields(options));
  const declarations: string[] = [];
  const constants: string[] = [];
  for (const {name, locator} of rows) {
    const receiver = options.declaration === 'constructor' ? 'page' : 'self.page';
    declare(lines, declarations, options, name, declaredLocator(options, locator, receiver, receiver, name, constants, unique));
  }
  const factories: string[] = [];
  for (const definition of definitions.filter(item => item.exposeInstances !== false)) {
    const component = definition.className.trim();
    for (const instance of definition.instances) {
      const candidate = componentRootCandidate(instance.root);
      if (!candidate || candidate.validation.status !== 'unique-target' || instance.root.stale) {
        throw Error(`Choose a unique component root for ${instance.name}. Select a positional fallback explicitly if needed.`);
      }
      assertComponentEvidence(definition, instance.id, candidate.id, policy);
      if (definition.collection?.parameter) assertComponentEvidence(definition, instance.id, 'parameter', policy);
      locators.push(candidate.locator);
      lines.push(`        self.${unique(identifier(instance.name))} = ${component}(page.${pythonLocator(candidate.locator)}${dependencyArguments(options)})`);
    }
    const collection = definition.collection;
    if (!collection) continue;
    locators.push(collection.locator);
    const stem = pythonModule(component);
    const attribute = unique(stem + '_roots');
    lines.push(`        self.${attribute} = page.${pythonLocator(collection.locator)}`);
    const count = unique('get_' + stem + '_count');
    const at = unique('get_' + stem + '_at');
    factories.push('', `    ${ioMethod(options)} ${count}(self)${returns(options, 'int')}:`,
      `        return ${awaited(options)}self.${attribute}.count()`,
      '', `    def ${at}(self, index${typed(options, 'int')})${returns(options, component)}:`,
      `        return ${component}(self.${attribute}.nth(index)${dependencyArguments(options)})`);
    if (collection.parameter) {
      const argument = collection.parameter.name;
      const method = unique('get_' + stem);
      factories.push('', `    def ${method}(self, ${argument}${typed(options, 'str')})${returns(options, component)}:`,
        `        root = self.${attribute}.filter(has=self.page.get_by_role("heading", name=${argument}, exact=True))`,
        `        return ${component}(root${dependencyArguments(options)})`);
    }
  }
  if (options.navigationPath) factories.push('', `    ${ioMethod(options)} navigate(self)${returns(options, 'None')}:`,
    `        ${awaited(options)}self.page.goto(${quote(options.navigationPath)}${options.timeoutMs ? ', timeout=' + options.timeoutMs : ''})`);
  lines.push(...declarations);
  configuredMethods(lines, rows, options);
  interactionMethods(lines, rows, unique, options);
  addConstants(lines, constants, options);
  const testAttributes = new Set(locators.flatMap(testIdAttributes));
  if (!locators.every(locator => locatorIsValid(locator))) throw Error('A locator uses unsupported composition or selector syntax.');
  if (testAttributes.size > 1) throw Error('Use one Playwright test ID attribute per generated page object');
  const [testAttribute] = testAttributes;
  const note = testAttribute && testAttribute !== 'data-testid'
    ? `\n\n# Configure playwright.selectors.set_test_id_attribute(${quote(testAttribute)}) before use.` : '';
  return {className, componentSources, page: [...lines, ...factories].join('\n'), note};
}

function playwrightImports(options: GenerationOptions, symbols: string[]): string {
  return `from playwright.${options.execution}_api import ${symbols.join(', ')}`;
}

function format(source: string, options: GenerationOptions): string {
  if (source.length > 4_000_000) throw Error('A generated file exceeds the output size limit.');
  const indented = options.indent === 4 ? source : source.replace(/^ +/gm, indent => ' '.repeat(indent.length / 2));
  return options.lineEnding === 'crlf' ? indented.replaceAll('\n', '\r\n') : indented;
}

function header(options: GenerationOptions, className: string, profile?: GenerationProfile): string {
  if (!options.header) return '';
  const expanded = options.header.replace(/\{\{(class|profile)\}\}/g, (_, field) => field === 'class' ? className : profile?.name ?? 'Basic synchronous');
  return '\n\n' + expanded.split(/\r\n|\r|\n/).map(line => '# ' + line.replace(/[\x00-\x1f\x7f]/g, ' ')).join('\n');
}

function pageImports(options: GenerationOptions, includeComponents: boolean) {
  const locatorType = options.annotations === 'typed' || (options.annotations !== 'none' && options.declaration !== 'constructor');
  const symbols = [...(includeComponents && options.annotations !== 'none' || locatorType ? ['Locator'] : []), 'Page'];
  if (options.assertions) symbols.push('expect');
  return [playwrightImports(options, symbols),
    ...(options.baseClass ? [`from ${options.baseModule} import ${options.baseClass} as _FrameworkBase`] : []),
    ...(includeComponents ? componentBaseImport(options) : []), ...dependencyImports(options)];
}

export function generate(model: PageModel, policy: RuntimePolicy = 'browser', profile?: GenerationProfile): string {
  const options = resolveGeneration(profile?.options ?? {}, model.generation ?? {});
  const {className, componentSources, page, note} = render(model, policy, options);
  const imports = (componentSources.length ? 'from __future__ import annotations\n\n' : '') + pageImports(options, !!componentSources.length).join('\n');
  return format([imports + note + header(options, className, profile), ...componentSources.map(item => item.body), page].join('\n\n\n') + '\n', options);
}

export function generatePackage(model: PageModel, policy: RuntimePolicy = 'browser', profile?: GenerationProfile): Record<string, string> {
  const options = resolveGeneration(profile?.options ?? {}, model.generation ?? {});
  const {componentSources, className, page, note} = render(model, policy, options);
  const root = options.packageName;
  const pages = root + '/' + options.pagesDirectory;
  const components = root + '/' + options.componentsDirectory;
  const files: Record<string, string> = {[root + '/__init__.py']: '', [pages + '/__init__.py']: '',
    [components + '/__init__.py']: ''};
  const names = new Map(componentSources.map(({definition}) => [definition.id, definition.className.trim()]));
  for (const {definition, body} of componentSources) {
    const dependencies = [...new Set(definition.children.map(link => names.get(link.definitionId)!))].sort();
    const prefix = options.packageImports === 'absolute' ? `${root}.${options.componentsDirectory}.` : '.';
    const imports = dependencies.map(name => `from ${prefix}${pythonModule(name)} import ${name}`);
    const symbols = ['Locator', ...(options.assertions ? ['expect'] : [])];
    files[`${components}/${pythonModule(definition.className.trim())}.py`] =
      format([playwrightImports(options, symbols), ...componentBaseImport(options), ...dependencyImports(options), ...imports].join('\n') +
        header(options, definition.className.trim(), profile) +
        '\n\n\n' + body + '\n', options);
  }
  const imports = componentSources.filter(({definition}) => definition.exposeInstances !== false)
    .map(({definition}) => definition.className.trim()).sort()
    .map(name => `from ${options.packageImports === 'absolute' ? root + '.' : '..'}${options.componentsDirectory}.${pythonModule(name)} import ${name}`);
  files[`${pages}/${options.pageModule || pythonModule(className)}.py`] =
    format([...pageImports(options, false), ...imports].join('\n') + note + header(options, className, profile) + '\n\n\n' + page + '\n', options);
  return files;
}

export async function artifactHashes(files: Readonly<Record<string, string>>) {
  const entries = await Promise.all(Object.keys(files).sort().map(async path => {
    const bytes = new TextEncoder().encode(files[path]);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [path, [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('')] as const;
  }));
  return Object.fromEntries(entries);
}

export function generateIntegrationSnippet(model: PageModel, policy: RuntimePolicy, profile: GenerationProfile): string {
  const options = resolveGeneration(profile.options, model.generation ?? {});
  const {className} = render(model, policy, options);
  const module = options.pageModule || pythonModule(className);
  const factory = names([className])('create_page_object');
  const argumentsList = options.dependencies.map(item => ', ' + item.name + '=' + item.name).join('');
  const source = [
    playwrightImports(options, ['Page']), ...dependencyImports(options),
    `from ${options.packageName}.${options.pagesDirectory}.${module} import ${className}`, '', '',
    `def ${factory}(page${typed(options, 'Page')}${dependencyParameters(options)})${returns(options, className)}:`,
    `    return ${className}(page${argumentsList})`, '',
  ].join('\n');
  return format(source, options);
}

export function generationManifest(model: PageModel, policy: RuntimePolicy, profile: GenerationProfile, paths: string[]) {
  const options = resolveGeneration(profile.options, model.generation ?? {});
  return {schemaVersion: 1, profile: {id: profile.id, revision: profile.revision},
    className: model.className.trim(), execution: options.execution, policy, files: [...paths].sort(),
    python: '3.' + options.pythonMinor,
    selectedElements: model.elements.filter(element => element.selected).length, components: model.components?.length ?? 0,
    framework: options.baseModule ? {module: options.baseModule, className: options.baseClass} : undefined};
}
