import {expect, it} from 'vitest';
import {nextUpdate, reconcileLive, type LiveUpdate} from '../src/core/lifecycle';
import {locatorKey, type Locator} from '../src/core/locator';
import {serializePage, type ElementModel, type PageModel} from '../src/core/model';
import {generate} from '../src/core/python';

const locator: Locator = {strategy: 'test-id', attribute: 'data-testid', value: 'quote'};
const original: ElementModel = {
  id: 'quote', referenceId: 'document:1', label: 'Quote', name: 'request_quote', action: 'click', tag: 'button',
  scopeKey: 'plans', selected: true, choice: locatorKey(locator), availability: 'available',
  candidates: [{id: locatorKey(locator), locator, basis: 'data-testid', score: 100, explanations: [], warnings: [],
    validation: {method: 'semantic-approximation', status: 'unique-target', count: 1}}],
};
const page: PageModel = {documentKey: 'document', url: 'https://example.test/plans', className: 'PlansPage',
  application: {route: '/plans', stateLabel: 'Quote entry'}, elements: [original]};
const replacement: ElementModel = {...original, id: 'replacement', referenceId: 'document:2', name: 'generated', choice: null};

function update(fields: Partial<LiveUpdate> = {}): LiveUpdate {
  return {type: 'update', version: 1, session: 'session', sequence: 1, full: true,
    context: {documentKey: 'document', route: '/plans', navigation: 0, revision: 1},
    ready: 'observed', upserts: [replacement], removed: ['document:1'], collections: [], proposals: [],
    metrics: {records: 2, roots: 1, fullScans: 1, durationMs: 1}, ...fields};
}

it('preserves choice, action, selection and name when a stable replacement is verified', () => {
  const result = reconcileLive(page, update(), true);
  expect(result.elements).toEqual([expect.objectContaining({id: original.id, referenceId: replacement.referenceId,
    choice: original.choice, action: original.action, name: original.name, selected: true, stale: false})]);
});

it('preserves unavailable rows and requires review in a different navigation', () => {
  const result = reconcileLive(page, update(), false);
  expect(result.elements).toEqual([
    expect.objectContaining({id: original.id, stale: true, availability: 'unavailable', selected: true}),
    expect.objectContaining({id: replacement.id, availability: 'available', selected: false}),
  ]);
  expect(generate(result)).toContain('page.get_by_test_id("quote")');
  const exported = JSON.parse(serializePage(result));
  expect(exported.application).toEqual(page.application);
  expect(exported.documentKey).toBeUndefined();
  expect(exported.elements[0].referenceId).toBeUndefined();
});

it('ignores duplicate and foreign updates and recovers gaps with a full update', () => {
  const previous = update();
  expect(nextUpdate(previous, previous)).toBe('ignore');
  expect(nextUpdate(previous, update({session: 'foreign', sequence: 2}))).toBe('ignore');
  expect(nextUpdate(previous, update({sequence: 3, full: false}))).toBe('sync');
  expect(nextUpdate(previous, update({sequence: 4}))).toBe('accept');
});
