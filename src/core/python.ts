import {selectedCandidate, type Locator} from './locator';
import type {PageModel} from './model';
import {identifier, reserved} from './python-names';

export {identifier} from './python-names';

export const quote = (value: string) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function pythonLocator(locator: Locator): string {
  switch (locator.strategy) {
    case 'css': return `locator(${quote(locator.selector)})`;
    case 'test-id': return `get_by_test_id(${quote(locator.value)})`;
    case 'role': return `get_by_role(${quote(locator.role)}, name=${quote(locator.name)}, exact=True)`;
    case 'alt': return `get_by_alt_text(${quote(locator.value)}, exact=True)`;
    default: return `get_by_${locator.strategy}(${quote(locator.value)}, exact=True)`;
  }
}

export function generate(model: PageModel): string {
  const className = model.className.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(className) || reserved.has(className)) {
    throw Error('Invalid Python class name');
  }
  const used = new Set(['page', 'navigate', 'PATH']);
  function unique(base: string) {
    let name = base;
    for (let i = 2; used.has(name); i++) name = base + '_' + i;
    used.add(name);
    return name;
  }
  const rows = model.elements.filter(element => element.selected).map(element => {
    const candidate = selectedCandidate(element);
    if (candidate?.validation.status !== 'unique-target') {
      throw Error(`Choose a locator that uniquely matches ${element.name}`);
    }
    return {name: unique(identifier(element.name)), action: element.action, locator: candidate.locator};
  });
  const testAttributes = new Set(rows.flatMap(({locator}) => locator.strategy === 'test-id' ? [locator.attribute] : []));
  if (testAttributes.size > 1) throw Error('Use one Playwright test ID attribute per generated page object');
  const [testAttribute] = testAttributes;
  const lines = ['from playwright.sync_api import Page'];
  if (testAttribute && testAttribute !== 'data-testid') {
    lines.push('', `# Configure playwright.selectors.set_test_id_attribute(${quote(testAttribute)}) before use.`);
  }
  lines.push('', '', `class ${className}:`, '    def __init__(self, page: Page) -> None:', '        self.page = page');
  for (const {name, locator} of rows) {
    lines.push(`        self.${name} = page.${pythonLocator(locator)}`);
  }
  for (const {name, action} of rows) {
    const method = unique(`${action}_${name}`);
    const needsValue = action === 'fill' || action === 'select';
    const read = action === 'read';
    const call = action === 'select' ? 'select_option' : read ? 'inner_text' : action;
    lines.push('', `    def ${method}(self${needsValue ? ', value: str' : ''}) -> ${read ? 'str' : 'None'}:`,
      `        ${read ? 'return ' : ''}self.${name}.${call}(${needsValue ? 'value' : ''})`);
  }
  return lines.join('\n') + '\n';
}
