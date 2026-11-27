import {expect, it} from 'vitest';
import {componentRootCandidate, memberCandidate, modelSchemaVersion, preserveMemberEdits, signatureSimilarity, validateComponentGraph,
  type ComponentDefinition, type ComponentRuntimeReport} from '../src/core/components';
import {locatorIsValid, type Candidate, type Locator} from '../src/core/locator';
import {serializePage, type ElementModel, type PageModel} from '../src/core/model';
import {generate, generatePackage, pythonLocator} from '../src/core/python';
import {pythonPackageZip} from '../src/core/python-package';

function row(id: string, locator: Locator): ElementModel {
  const candidate: Candidate = {id: 'candidate', locator, score: 90, basis: 'test', explanations: [], warnings: [],
    validation: {status: 'unique-target', method: 'dom-css', count: 1}};
  return {id, name: id, label: id, tag: 'button', action: 'click', candidates: [candidate], choice: null, selected: true};
}

function definition(): ComponentDefinition {
  const member = row('see_plans', {strategy: 'role', role: 'button', name: 'See plans'});
  const instance = (name: string) => ({id: name, name: name + '_card', key: name,
    root: row(name, {strategy: 'test-id', attribute: 'data-testid', value: name + '-card'})});
  return {id: 'plan', title: 'Plan card', className: 'SpecialtyPlanCard', confidence: 1, reasons: [], signature: ['button'],
    instances: [instance('dental'), instance('vision')], children: [],
    collection: {locator: {strategy: 'css', selector: 'article.plan'}, count: 2, parameter: {name: 'name', role: 'heading'}},
    members: [{...member, optional: false, observations: ['dental', 'vision'].map(instanceId => ({
      instanceId, checks: {candidate: {status: 'unique-target', method: 'dom-css'}}}))}],
  };
}

it('computes deterministic multiset similarity and tolerates one extra slot', () => {
  expect(signatureSimilarity(['h', 'p', 'button'], ['button', 'p', 'h'])).toBe(1);
  expect(signatureSimilarity(['h', 'p', 'button'], ['h', 'p', 'button', 'badge'])).toBeGreaterThan(0.8);
  expect(signatureSimilarity(['h', 'p', 'button'], ['a', 'img'])).toBe(0);
});

it('renders one reusable class, lazy parameter and index lookups, and separate modules', () => {
  const model: PageModel = {url: 'https://test.invalid', className: 'PlansPage', elements: [], components: [definition()]};
  const source = generate(model);
  expect(source.match(/class SpecialtyPlanCard:/g)).toHaveLength(1);
  expect(source).toContain('root.get_by_role("button", name="See plans", exact=True)');
  expect(source).toContain('def get_specialty_plan_card(self, name: str)');
  expect(source).toContain('name=name, exact=True');
  expect(source).toContain('return SpecialtyPlanCard(self.specialty_plan_card_roots.nth(index))');
  expect(generatePackage(model)['generated/pages/plans_page.py']).toContain('from ..components.specialty_plan_card import SpecialtyPlanCard');
  expect(JSON.parse(serializePage(model)).schemaVersion).toBe(modelSchemaVersion);
});

it('rejects cycles, missing relationships, duplicate roots, and unsupported schema versions', () => {
  const root = definition();
  const locator: Locator = {strategy: 'css', selector: 'div.child'};
  expect(() => validateComponentGraph([{...root, children: [{name: 'self', definitionId: root.id, locator, collection: false}]}])).toThrow(/Circular/);
  expect(() => validateComponentGraph([{...root, children: [{name: 'child', definitionId: 'missing', locator, collection: false}]}])).toThrow(/missing/);
  expect(() => validateComponentGraph([{...root, instances: [...root.instances, root.instances[0]]}])).toThrow(/unique/);
  expect(() => generate({url: '', className: 'PlansPage', elements: [], schemaVersion: 100})).toThrow(/schema version/);
  expect(generate({url: '', className: 'PlansPage', elements: []})).toContain('class PlansPage');
});

it('keeps edits across repeated observation and distinguishes optional absence', () => {
  const fresh = definition();
  const prior = definition();
  prior.members[0] = {...prior.members[0], name: 'custom_button', choice: 'candidate', optional: true};
  fresh.members[0].observations[1].checks.candidate = {status: 'no-match', method: 'dom-css'};
  const merged = preserveMemberEdits(prior, fresh);
  expect(merged.members[0]).toMatchObject({name: 'custom_button', choice: 'candidate', optional: true});
  expect(generate({url: '', className: 'PlansPage', elements: [], components: [merged]})).toContain('def has_custom_button');
  merged.members[0].optional = false;
  expect(() => generate({url: '', className: 'PlansPage', elements: [], components: [merged]})).toThrow(/relative locator/);
});

it('composes scoped filters and rejects unsafe selector engines and indexes', () => {
  const locator: Locator = {strategy: 'chain', root: {strategy: 'filter', base: {strategy: 'css', selector: 'article'},
    has: {strategy: 'role', role: 'heading', name: 'Dental'}}, child: {strategy: 'text', value: 'See plans'}};
  expect(locatorIsValid(locator)).toBe(true);
  expect(pythonLocator(locator)).toContain('.filter(has=page.get_by_role("heading", name="Dental", exact=True)).get_by_text');
  expect(locatorIsValid({strategy: 'css', selector: 'button >> xpath=..'})).toBe(false);
  expect(locatorIsValid({strategy: 'css', selector: ':scope ~ .elsewhere'})).toBe(false);
  expect(locatorIsValid({strategy: 'css', selector: ':scope > button'})).toBe(true);
  expect(locatorIsValid({strategy: 'index', index: -1, base: locator})).toBe(false);
});

it('writes deterministic ZIPs and rejects unsafe archive paths', async () => {
  const files = generatePackage({url: '', className: 'PlansPage', elements: [], components: [definition()]});
  const first = new Uint8Array(await pythonPackageZip(files).arrayBuffer());
  const second = new Uint8Array(await pythonPackageZip({...files}).arrayBuffer());
  expect(first).toEqual(second);
  expect(new DataView(first.buffer).getUint32(0, true)).toBe(0x04034b50);
  expect(() => pythonPackageZip({'../outside.py': 'bad'})).toThrow(/path/);
});

it('excludes fresh wrong-root evidence from automatic component ranking while retaining a manual choice', () => {
  const member = definition().members[0];
  const alternative = {...member.candidates[0], id: 'fallback', score: 50};
  member.candidates.push(alternative);
  for (const observation of member.observations) observation.checks.fallback = observation.checks.candidate;
  const wrongRoot: ComponentRuntimeReport = {instanceId: 'dental', memberId: member.id, evidence: {
    method: 'playwright', strategy: 'chain', status: 'validation-error', identity: 'unverified',
    rootCount: 1, rootIdentity: 'wrong', timestamp: new Date().toISOString(), durationMs: 5, requestId: 'r',
    browserId: 'b', documentKey: 'd', candidateId: 'candidate', elementId: member.id, testIdAttribute: 'data-testid',
    expiresAt: Date.now() + 30_000, freshness: 'current',
  }};
  expect(memberCandidate(member, [wrongRoot])?.id).toBe('fallback');
  member.choice = 'candidate';
  expect(memberCandidate(member, [wrongRoot])?.id).toBe('candidate');
});

it('requires an explicit choice before using a positional component root', () => {
  const root = definition().instances[0].root;
  root.candidates[0].basis = 'Structural fallback';
  expect(componentRootCandidate(root)).toBeUndefined();
  expect(componentRootCandidate({...root, choice: 'candidate'})).toBe(root.candidates[0]);
});
