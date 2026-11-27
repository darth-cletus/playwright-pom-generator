import {expect, it} from 'vitest';
import {parseSettings, recommendedCandidate, type Validation} from '../src/core/locator';
import {baseScores, instability, rankCandidates, scoreCandidate, type Proposal} from '../src/core/scoring';

const unique: Validation = {status: 'unique-target', method: 'dom-css', count: 1, matchesTarget: true};
const proposal: Proposal = {locator: {strategy: 'css', selector: '#email'}, basis: 'id', priority: 'id'};

it.each([':r0:', '_r_0_', 'react-select-12-input', 'component-25', 'css-a3c4df', 'email-aaff1100', 'a17c02b8-2542-4a3c-867b-ccd941c4ee02'])(
  'explains instability for %s', value => expect(instability(value)).toBeTruthy(),
);
it.each(['address-line-2', 'section2025', 'email-2'])('keeps stable numbered identifier %s', value => {
  expect(instability(value)).toBeUndefined();
});
it('uses configurable priorities and explains the stability penalty', () => {
  const stable = scoreCandidate(proposal, unique, {...baseScores, id: 82});
  const dynamic = scoreCandidate({...proposal, unstable: 'Looks generated.'}, unique);
  expect(stable.score).toBe(86);
  expect(dynamic.score).toBe(39);
  expect(dynamic.warnings).toContain('Looks generated.');
  expect(dynamic.explanations).toContain('-50 Potentially unstable identifier.');
});
it('ranks deterministically and never recommends a wrong target', () => {
  const good = scoreCandidate(proposal, unique);
  const tied = scoreCandidate({...proposal, locator: {strategy: 'css', selector: '#z'}}, unique);
  const wrong = scoreCandidate({...proposal, priority: 'testId'}, {...unique, status: 'wrong-target', matchesTarget: false});
  expect(rankCandidates([wrong, tied, good])).toEqual([good, tied, wrong]);
  expect(recommendedCandidate([wrong, good])).toBe(good);
  expect(recommendedCandidate([wrong])).toBeUndefined();
});
it('normalizes and de-duplicates test attributes without changing their priority', () => {
  expect(parseSettings('DATA-QA, data-cy data-qa', 'data-custom')).toEqual({
    testAttributes: ['data-qa', 'data-cy'], playwrightTestAttribute: 'data-custom',
  });
  expect(() => parseSettings('value', 'data-testid')).toThrow();
});
