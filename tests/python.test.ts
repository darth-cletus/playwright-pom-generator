import {describe, expect, it} from 'vitest';
import {locatorKey, type Locator} from '../src/core/locator';
import {generate, identifier, pythonLocator, quote} from '../src/core/python';
import {serializePage, type PageModel} from '../src/core/model';

const locator: Locator = {strategy: 'test-id', attribute: 'data-testid', value: 'email'};
const model: PageModel = {
  url: 'https://example.com',
  className: 'LoginPage',
  elements: [{
    id: '1', name: 'Email input', label: 'Email', tag: 'input', action: 'fill', selected: true, choice: null,
    candidates: [{
      id: locatorKey(locator), locator, score: 100, basis: 'test id', warnings: [], explanations: [],
      validation: {status: 'unique-target', count: 1, matchesTarget: true, method: 'semantic-approximation'},
    }],
  }],
};

describe('generator', () => {
  it('generates fill method', () => expect(generate(model)).toContain('self.email_input.fill(value)'));
  it('rejects ambiguous locator', () => {
    const copy = structuredClone(model);
    Object.assign(copy.elements[0].candidates[0].validation, {count: 2, status: 'ambiguous'});
    expect(() => generate(copy)).toThrow();
  });
  it('handles reserved names', () => expect(identifier('class')).toBe('element_class'));
  it('deduplicates names', () => {
    const copy = structuredClone(model);
    copy.elements.push({...copy.elements[0], id: '2'});
    expect(generate(copy)).toContain('self.email_input_2 =');
  });
  it('preserves manual overrides in code and JSON and supports returning to automatic', () => {
    const copy = structuredClone(model);
    const element = copy.elements[0];
    const alternative = {...element.candidates[0], id: 'label', locator: {strategy: 'label', value: 'Email'} as Locator};
    element.candidates.push(alternative);
    element.choice = alternative.id;
    element.name = 'New name';
    element.selected = false;
    expect(generate(copy)).not.toContain('get_by_label');
    element.selected = true;
    expect(generate(copy)).toContain('self.new_name = page.get_by_label("Email", exact=True)');
    expect(JSON.parse(serializePage(copy))).toEqual(copy);
    element.choice = null;
    expect(generate(copy)).toContain('page.get_by_test_id("email")');
  });
  it('rejects a manual override that matches the wrong target', () => {
    const copy = structuredClone(model);
    const element = copy.elements[0];
    element.choice = element.candidates[0].id;
    element.candidates[0].validation.status = 'wrong-target';
    expect(() => generate(copy)).toThrow();
  });
  it('escapes strings and keeps Unicode readable', () => {
    expect(quote('é 🦊 " \\ \n \r \t \u0000 \u2028')).toBe('"é 🦊 \\" \\\\ \\n \\r \\t \\u0000 \\u2028"');
  });
  it('emits exact semantic locators and a custom Playwright configuration note', () => {
    const copy = structuredClone(model);
    copy.elements[0].candidates[0].locator = {strategy: 'test-id', attribute: 'data-qa', value: 'email'};
    expect(generate(copy)).toContain('playwright.selectors.set_test_id_attribute("data-qa")');
    expect(pythonLocator({strategy: 'role', role: 'button', name: 'Save'})).toBe('get_by_role("button", name="Save", exact=True)');
    expect(pythonLocator({strategy: 'alt', value: 'Company logo'})).toBe('get_by_alt_text("Company logo", exact=True)');
  });
});
