import {expect, it} from 'vitest';
import {assess, readPageModel} from '../src/core/review';
import {locatorKey, type Locator} from '../src/core/locator';
import type {PageModel} from '../src/core/model';

const tracked: Locator = {strategy: 'css', selector: '#new'};
const model: PageModel = {className: 'Checkout', documentKey: 'temporary', url: 'https://example.test',
  schemaVersion: 3, elements: [{id: 'field', referenceId: 'temporary:1', name: 'payment', label: 'Payment', tag: 'input',
    action: 'fill', candidates: [{id: locatorKey(tracked), locator: tracked, basis: 'id', score: 95,
      warnings: [], explanations: [], validation: {method: 'dom-css', status: 'unique-target'}}],
    selected: true, choice: null}]};

it('opens portable models without current document identity', () => {
  const result = readPageModel(JSON.stringify(model));
  expect(result.elements[0].name).toBe('payment');
  expect(result.documentKey).toBeUndefined();
  expect(result.elements[0].referenceId).toBeUndefined();
  expect(() => readPageModel(JSON.stringify({...model, schemaVersion: 99}))).toThrow();
});

it('suggests a replacement only for a single observed field with a unique locator', () => {
  const entry = {id: 'old', name: 'payment', className: 'Checkout', line: 3, editable: true,
    locator: {strategy: 'css', selector: '#old'} as const};
  expect(assess(entry, model).replacement).toEqual(tracked);
  expect(assess(entry, {...model, elements: [...model.elements, ...model.elements]}).replacement).toBeUndefined();
  expect(assess({...entry, locator: tracked}, model).replacement).toBeUndefined();
});
