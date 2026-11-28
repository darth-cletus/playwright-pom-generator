import {expect, it} from 'vitest';
import {readContextPath, scopeLocator, type ContextBoundary} from '../src/core/context';
import {locatorIsValid, type Locator} from '../src/core/locator';
import {serializePage} from '../src/core/model';
import {pythonLocator} from '../src/core/python';

const path: ContextBoundary[] = [
  {kind: 'shadow', tag: 'checkout-widget', owner: {strategy: 'css', selector: 'checkout-widget'}},
  {kind: 'frame', tag: 'iframe', owner: {strategy: 'css', selector: 'iframe#billing'}},
  {kind: 'frame', tag: 'iframe', owner: {strategy: 'css', selector: 'iframe#challenge'}},
];
const button: Locator = {strategy: 'role', role: 'button', name: 'Confirm'};

it('composes a mixed path using distinct frame transitions', () => {
  const locator = scopeLocator(path, button);
  expect(locator).toBeDefined();
  expect(pythonLocator(locator!)).toBe(
    'locator("checkout-widget").locator("iframe#billing").content_frame.locator("iframe#challenge").content_frame.get_by_role("button", name="Confirm", exact=True)');
  expect(locatorIsValid({strategy: 'filter', base: button, has: locator!})).toBe(false);
  expect(scopeLocator([...path, ...path], button)).toBeUndefined();
});

it('validates context messages and exports a portable scoped model', () => {
  expect(readContextPath(path)).toEqual(path);
  expect(readContextPath([{...path[0], owner: {strategy: 'css', selector: 'xpath=//secret'}}])).toBeUndefined();
  const model = JSON.parse(serializePage({
    className: 'Checkout', url: 'https://example.test/', documentKey: 'temporary',
    elements: [], contexts: [{path, state: 'accessible'}],
  }));
  expect(model.schemaVersion).toBe(3);
  expect(model.contexts[0].path).toEqual(path);
  expect(model.documentKey).toBeUndefined();
});
