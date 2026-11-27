import {expect, it} from 'vitest';
import {readCommand} from '../src/core/inspector';
import {defaultSettings, type Candidate} from '../src/core/locator';
import {mergePage, serializePage, type ElementModel, type PageModel} from '../src/core/model';
import {generate} from '../src/core/python';

const candidate: Candidate = {id: 'fallback', locator: {strategy: 'css', selector: '#card'}, basis: 'id',
  score: 85, explanations: [], warnings: [], validation: {status: 'unique-target', method: 'dom-css', count: 1}};
const element: ElementModel = {id: 'model-1', referenceId: 'first:1', name: 'card', label: 'Card', tag: 'article', action: 'assert',
  candidates: [candidate], choice: null, selected: true};
const page: PageModel = {documentKey: 'first', url: 'https://test.invalid', className: 'GeneratedPage', elements: [element]};

it('accepts inspector messages only when commands and settings are valid', () => {
  expect(readCommand({type: 'start', mode: 'exact', settings: defaultSettings})?.type).toBe('start');
  expect(readCommand({type: 'start', mode: 'text', settings: defaultSettings})).toBeUndefined();
  expect(readCommand({type: 'navigate', direction: 'child', child: -1})).toBeUndefined();
  expect(readCommand({type: 'inspect', id: {node: 1}})).toBeUndefined();
  expect(readCommand({type: 'track', ids: [1]})).toBeUndefined();
});

it('updates live evidence using identity while preserving order, names, choice and selection', () => {
  const earlier = {...element, id: 'model-3', referenceId: 'first:3'};
  const custom = {...element, name: 'my_card', choice: candidate.id, selected: false};
  const current = {...page, className: 'Plans', elements: [earlier, custom]};
  const incoming = {...page, elements: [{...element, label: 'Updated'}, {...element, id: 'model-2', referenceId: 'first:2'}]};
  const merged = mergePage(current, incoming);
  expect(merged.className).toBe('Plans');
  expect(merged.elements).toEqual([earlier, {...custom, label: 'Updated'}, incoming.elements[1]]);
});

it('does not match entries from replacement documents or by shared selector', () => {
  const incoming = {...page, documentKey: 'second', elements: [{...element, referenceId: 'second:1'}]};
  expect(mergePage(page, incoming)).toBe(incoming);
  expect(mergePage(page, {...page, elements: [{...element, id: 'model-2', referenceId: 'first:2'}]}).elements).toHaveLength(2);
});

it('exports static locator attributes and blocks known detached selections', () => {
  const output = generate(page);
  expect(output).toContain('self.card = page.locator("#card")');
  expect(output.match(/def /g)).toHaveLength(1);
  expect(JSON.parse(serializePage(page))).toEqual(page);
  expect(() => generate({...page, elements: [{...element, stale: true}]})).toThrow(/detached/);
});
