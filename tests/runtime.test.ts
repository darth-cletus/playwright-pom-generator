import {expect, it} from 'vitest';
import {recommendedCandidate, type Candidate} from '../src/core/locator';
import {archiveValidation, serializePage, type PageModel} from '../src/core/model';
import {generate} from '../src/core/python';
import {type RuntimeEvidence} from '../src/core/runtime';
import {readResults} from '../src/sidepanel/runtime-client';

function evidence(status: RuntimeEvidence['status'], partial: Partial<RuntimeEvidence> = {}): RuntimeEvidence {
  return {status, method: 'playwright', strategy: 'css', identity: 'confirmed', timestamp: new Date().toISOString(),
    durationMs: 2, freshness: 'current', expiresAt: Date.now() + 30_000, requestId: 'r', browserId: 'b',
    documentKey: 'document', elementId: 'row', candidateId: 'css', testIdAttribute: 'data-testid', ...partial};
}

function candidate(runtime?: RuntimeEvidence, partial: Partial<Candidate> = {}): Candidate {
  return {id: 'css', score: 80, locator: {strategy: 'css', selector: '#button'}, basis: 'CSS',
    warnings: [], explanations: [], validation: {method: 'dom-css', status: 'unique-target'}, runtime, ...partial};
}

function model(candidates: Candidate[], choice: string | null): PageModel {
  return {url: 'https://test.invalid', documentKey: 'document', className: 'PageObject', elements: [{
    id: 'row', label: 'Button', name: 'item', tag: 'button', action: 'click', selected: true, candidates, choice,
  }]};
}

it.each(['wrong-target', 'ambiguous', 'no-match'] as const)('excludes fresh %s without changing the manual choice', status => {
  const failed = candidate(evidence(status));
  const fallback = candidate(undefined, {id: 'alt', score: 65});
  expect(recommendedCandidate([failed, fallback])).toBe(fallback);
  const page = model([failed, fallback], failed.id);
  expect(() => generate(page)).toThrow(/Choose another locator/);
  expect(page.elements[0].choice).toBe(failed.id);
});

it('uses confirmed evidence as a tie-breaker while preserving inherent quality', () => {
  const confirmed = candidate(evidence('unique-target'));
  const better = candidate(undefined, {score: 95});
  const tied = candidate(undefined);
  expect(recommendedCandidate([better, confirmed])).toBe(better);
  expect(recommendedCandidate([tied, confirmed])).toBe(confirmed);
});

it('allows offline generation with historical evidence and enforces opt-in policy', () => {
  const historical = candidate(evidence('wrong-target', {expiresAt: Date.now() - 1}));
  const page = model([historical], 'css');
  expect(generate(page)).toContain('page.locator');
  expect(() => generate(page, 'confirmed')).toThrow(/Validate the locator/);
  expect(JSON.parse(serializePage(page)).elements[0].candidates[0].runtime.freshness).toBe('historical');
  const current = model([candidate(evidence('unique-target'))], 'css');
  expect(generate(current, 'confirmed')).toContain('page.locator');
  expect(() => generate(archiveValidation(current)!, 'runtime')).toThrow(/Validate the locator/);
});

it('validates response identity and whitelists exported evidence fields', () => {
  const expected = {requestId: 'r', browserId: 'b', documentKey: 'document', strategies: ['css'] as const};
  const payload = {...expected, results: [{...evidence('unique-target'), count: 1, token: 'secret',
    states: {visible: true, unexpected: 'private'}}]};
  expect(readResults(payload, expected)[0].states).toEqual({visible: true});
  expect(JSON.stringify(readResults(payload, expected))).not.toContain('secret');
  expect(() => readResults({...payload, documentKey: 'old'}, expected)).toThrow(/does not match/);
  expect(() => readResults({...payload, results: [{status: 'invalid'}]}, expected)).toThrow(/Invalid/);
  expect(() => readResults({...payload, results: [{...payload.results[0], count: 2}]}, expected)).toThrow(/Inconsistent/);
});
