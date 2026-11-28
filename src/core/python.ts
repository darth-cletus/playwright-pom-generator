import {selectedCandidate, testIdAttributes, type Locator} from './locator';
import type {PageModel} from './model';
import {identifier, reserved} from './python-names';
import {currentEvidence, runtimeRejects, type RuntimePolicy} from './runtime';
import {componentRootCandidate, memberCandidate, modelSchemaVersion, pythonModule, validateComponentGraph, type ComponentDefinition} from './components';
import type {Action} from './model';

export {identifier} from './python-names';

export const quote = (value: string) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function pythonLocator(locator: Locator, page = 'page'): string {
  switch (locator.strategy) {
    case 'css': return `locator(${quote(locator.selector)})`;
    case 'test-id': return `get_by_test_id(${quote(locator.value)})`;
    case 'role': return `get_by_role(${quote(locator.role)}, name=${quote(locator.name)}, exact=True)`;
    case 'alt': return `get_by_alt_text(${quote(locator.value)}, exact=True)`;
    case 'chain': return `${pythonLocator(locator.root, page)}.${pythonLocator(locator.child, page)}`;
    case 'filter': return `${pythonLocator(locator.base, page)}.filter(${locator.has
      ? `has=${page}.${pythonLocator(locator.has, page)}` : `has_text=${quote(locator.text ?? '')}`})`;
    case 'index': return `${pythonLocator(locator.base, page)}.nth(${locator.index})`;
    default: return `get_by_${locator.strategy}(${quote(locator.value)}, exact=True)`;
  }
}

type Row = {name: string; action: Action; locator: Locator};

function names(initial: string[]) {
  const used = new Set(initial);
  return (base: string) => {
    let name = base;
    for (let i = 2; used.has(name); i++) name = base + '_' + i;
    used.add(name);
    return name;
  };
}

function interactionMethods(lines: string[], rows: readonly Row[], unique: (base: string) => string) {
  for (const {name, action} of rows) {
    if (action === 'assert') continue;
    const method = unique(`${action}_${name}`);
    const needsValue = action === 'fill' || action === 'select';
    const read = action === 'read';
    const call = action === 'select' ? 'select_option' : read ? 'inner_text' : action;
    lines.push('', `    def ${method}(self${needsValue ? ', value: str' : ''}) -> ${read ? 'str' : 'None'}:`,
      `        ${read ? 'return ' : ''}self.${name}.${call}(${needsValue ? 'value' : ''})`);
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
  policy: RuntimePolicy, locators: Locator[]): string {
  const unique = names(['root', 'page']);
  const optionalNames: string[] = [];
  const lines = [`class ${definition.className.trim()}:`, '    def __init__(self, root: Locator) -> None:', '        self.root = root'];
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
    const name = unique(identifier(member.name));
    rows.push({name, action: member.action, locator: candidate.locator});
    if (member.optional) optionalNames.push(name);
    locators.push(candidate.locator);
    lines.push(`        self.${name} = root.${pythonLocator(candidate.locator, 'root.page')}`);
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
      nestedMethods.push('', `    def ${method}(self, index: int) -> ${className}:`,
        `        return ${className}(self.${name}.nth(index))`);
    } else lines.push(`        self.${name} = ${className}(${locator})`);
  }
  for (const name of optionalNames) lines.push('', `    def ${unique('has_' + name)}(self) -> bool:`, `        return self.${name}.count() == 1`);
  interactionMethods(lines, rows, unique);
  return [...lines, ...nestedMethods].join('\n');
}

function render(model: PageModel, policy: RuntimePolicy) {
  const className = model.className.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(className) || reserved.has(className)) {
    throw Error('Invalid Python class name');
  }
  const definitions = model.components ?? [];
  if (model.schemaVersion !== undefined && model.schemaVersion !== 1 && model.schemaVersion !== modelSchemaVersion) {
    throw Error('Unsupported page object schema version.');
  }
  validateComponentGraph(definitions, className);
  const unique = names(['page', 'navigate', 'PATH']);
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
    return {name: unique(identifier(element.name)), action: element.action, locator: candidate.locator};
  });
  const locators = rows.map(row => row.locator);
  const componentSources = definitions.map(definition => ({definition, body: componentClass(definition, definitions, policy, locators)}));
  const lines = [`class ${className}:`, '    def __init__(self, page: Page) -> None:', '        self.page = page'];
  for (const {name, locator} of rows) {
    lines.push(`        self.${name} = page.${pythonLocator(locator)}`);
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
      lines.push(`        self.${unique(identifier(instance.name))} = ${component}(page.${pythonLocator(candidate.locator)})`);
    }
    const collection = definition.collection;
    if (!collection) continue;
    locators.push(collection.locator);
    const stem = pythonModule(component);
    const attribute = unique(stem + '_roots');
    lines.push(`        self.${attribute} = page.${pythonLocator(collection.locator)}`);
    const count = unique('get_' + stem + '_count');
    const at = unique('get_' + stem + '_at');
    factories.push('', `    def ${count}(self) -> int:`, `        return self.${attribute}.count()`,
      '', `    def ${at}(self, index: int) -> ${component}:`, `        return ${component}(self.${attribute}.nth(index))`);
    if (collection.parameter) {
      const argument = collection.parameter.name;
      const method = unique('get_' + stem);
      factories.push('', `    def ${method}(self, ${argument}: str) -> ${component}:`,
        `        root = self.${attribute}.filter(has=self.page.get_by_role("heading", name=${argument}, exact=True))`,
        `        return ${component}(root)`);
    }
  }
  interactionMethods(lines, rows, unique);
  const testAttributes = new Set(locators.flatMap(testIdAttributes));
  if (testAttributes.size > 1) throw Error('Use one Playwright test ID attribute per generated page object');
  const [testAttribute] = testAttributes;
  const note = testAttribute && testAttribute !== 'data-testid'
    ? `\n\n# Configure playwright.selectors.set_test_id_attribute(${quote(testAttribute)}) before use.` : '';
  return {className, componentSources, page: [...lines, ...factories].join('\n'), note};
}

export function generate(model: PageModel, policy: RuntimePolicy = 'browser'): string {
  const {componentSources, page, note} = render(model, policy);
  const imports = componentSources.length
    ? 'from __future__ import annotations\n\nfrom playwright.sync_api import Locator, Page'
    : 'from playwright.sync_api import Page';
  return [imports + note, ...componentSources.map(item => item.body), page].join('\n\n\n') + '\n';
}

export function generatePackage(model: PageModel, policy: RuntimePolicy = 'browser'): Record<string, string> {
  const {componentSources, className, page, note} = render(model, policy);
  const files: Record<string, string> = {'generated/__init__.py': '', 'generated/pages/__init__.py': '',
    'generated/components/__init__.py': ''};
  const names = new Map(componentSources.map(({definition}) => [definition.id, definition.className.trim()]));
  for (const {definition, body} of componentSources) {
    const dependencies = [...new Set(definition.children.map(link => names.get(link.definitionId)!))].sort();
    const imports = dependencies.map(name => `from .${pythonModule(name)} import ${name}`);
    files[`generated/components/${pythonModule(definition.className.trim())}.py`] =
      ['from playwright.sync_api import Locator', ...imports].join('\n') + '\n\n\n' + body + '\n';
  }
  const imports = componentSources.filter(({definition}) => definition.exposeInstances !== false)
    .map(({definition}) => definition.className.trim()).sort()
    .map(name => `from ..components.${pythonModule(name)} import ${name}`);
  files[`generated/pages/${pythonModule(className)}.py`] =
    ['from playwright.sync_api import Page', ...imports].join('\n') + note + '\n\n\n' + page + '\n';
  return files;
}
import {stableTestId} from './lifecycle';
