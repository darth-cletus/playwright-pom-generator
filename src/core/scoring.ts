import {locatorKey, type Candidate, type Locator, type Validation, type ValidationStatus} from './locator';

export const baseScores = {
  testId: 100, alternativeTestId: 95, role: 95, label: 95, id: 85,
  placeholder: 80, alt: 80, title: 75, text: 75, name: 70,
  combination: 65, className: 40, dynamic: 35, structural: 5,
};

export interface Proposal {
  locator: Locator;
  basis: string;
  priority: keyof typeof baseScores;
  unstable?: string;
  order?: number;
}

export function instability(value: string): string | undefined {
  if (/^[{]?[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}[}]?$/i.test(value)) return 'Looks like a UUID.';
  if (/^:r[\da-z]+:$/i.test(value) || /^_[rR]_[\da-z]+_$/.test(value)) return 'Looks like a React-generated ID.';
  if (/^(?:react-select|headlessui|radix|mui|mat|ember|ext-gen|cdk|ng-select|component|instance)(?:[-_].*)?[-_]?\d+(?:[-_].*)?$/i.test(value)) {
    return 'Looks like a generated component instance ID.';
  }
  if (/^(?:css|sc|jsx|jss|emotion)[-_][a-z0-9]{4,}(?:[-_].*)?$/i.test(value) ||
      /(?:^|[-_])[\da-f]{8,}(?:$|[-_])/i.test(value) || /__[a-z\d_-]{5,}$/i.test(value)) {
    return 'Looks like a generated class or build hash.';
  }
  if (/^[\da-z_-]{28,}$/i.test(value) && /\d/.test(value)) return 'Long opaque identifier may change.';
}

export function scoreCandidate(proposal: Proposal, validation: Validation, scores: typeof baseScores = baseScores): Candidate {
  const {locator, basis, unstable, priority, order = 0} = proposal;
  let score = scores[priority];
  const explanations = [`${basis} starts at ${score}.`];
  const warnings: string[] = [];
  function adjust(amount: number, reason: string) {
    score += amount;
    explanations.push(`${amount >= 0 ? '+' : ''}${amount} ${reason}`);
  }
  if (unstable) {
    adjust(Math.min(score, scores.dynamic) - score, 'Potentially unstable identifier.');
    warnings.push(unstable);
  }
  if (order) adjust(-Math.min(order, 10), 'Configured test attribute priority.');
  if (priority === 'structural') warnings.push('Depends on DOM order and ancestry.');
  if (priority === 'combination') adjust(-2, 'Requires multiple attributes to stay stable.');
  if (locator.strategy !== 'css' && locator.strategy !== 'test-id') {
    const text = locator.strategy === 'role' ? locator.name : locator.value;
    warnings.push('Exact text can change with copy or localization.');
    if (text.length > 60) adjust(-8, 'Long text is more likely to change.');
  }
  if (validation.method === 'semantic-approximation') {
    adjust(-2, 'Browser-side semantic approximation.');
    warnings.push('Confirm this locator in Playwright.');
  }
  if (validation.status === 'unique-target') adjust(4, 'Matches only the intended element.');
  else if (validation.status === 'ambiguous') adjust(-25, 'Matches multiple elements.');
  else if (validation.status === 'unvalidated') adjust(-15, 'Validation unavailable.');
  else adjust(-50, 'Validation did not find a usable target match.');
  return {id: locatorKey(locator), locator, basis, score: Math.max(0, Math.min(100, score)), explanations, warnings, validation};
}

const statusOrder: Record<ValidationStatus, number> = {
  'unique-target': 0, unvalidated: 1, ambiguous: 2, 'no-match': 3, 'wrong-target': 4, error: 5,
};

export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.sort((a, b) =>
    statusOrder[a.validation.status] - statusOrder[b.validation.status] ||
    b.score - a.score ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
