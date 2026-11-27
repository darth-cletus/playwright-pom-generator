export type Locator =
  | {strategy: 'css'; selector: string}
  | {strategy: 'test-id'; attribute: string; value: string}
  | {strategy: 'role'; role: string; name: string}
  | {strategy: 'label' | 'placeholder' | 'text' | 'alt' | 'title'; value: string};

export type ValidationMethod = 'dom-css' | 'semantic-approximation' | 'playwright' | 'none';
export type ValidationStatus = 'unique-target' | 'ambiguous' | 'no-match' | 'wrong-target' | 'unvalidated' | 'error';

export interface Validation {
  method: ValidationMethod;
  status: ValidationStatus;
  count?: number;
  matchesTarget?: boolean;
}

export interface Candidate {
  id: string;
  locator: Locator;
  basis: string;
  score: number;
  explanations: string[];
  warnings: string[];
  validation: Validation;
}

export interface LocatorSettings {
  testAttributes: string[];
  playwrightTestAttribute: string;
}

export const defaultSettings: LocatorSettings = {
  testAttributes: ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'data-automation-id'],
  playwrightTestAttribute: 'data-testid',
};

export function parseSettings(attributes: string, playwright: string): LocatorSettings {
  const testAttributes = [...new Set(attributes.split(/[\s,]+/).filter(Boolean).map(value => value.toLowerCase()))];
  const playwrightTestAttribute = playwright.trim().toLowerCase();
  if (![...testAttributes, playwrightTestAttribute].every(value => /^data-[a-z0-9_-]+$/.test(value))) {
    throw Error('Use data-* attribute names, such as data-testid.');
  }
  return {testAttributes, playwrightTestAttribute};
}

export function locatorKey(locator: Locator): string {
  switch (locator.strategy) {
    case 'css': return JSON.stringify([locator.strategy, locator.selector]);
    case 'role': return JSON.stringify([locator.strategy, locator.role, locator.name]);
    case 'test-id': return JSON.stringify([locator.strategy, locator.attribute, locator.value]);
    default: return JSON.stringify([locator.strategy, locator.value]);
  }
}

export function recommendedCandidate(candidates: readonly Candidate[]): Candidate | undefined {
  return candidates.find(candidate => candidate.validation.status === 'unique-target');
}

export function selectedCandidate(element: {candidates: Candidate[]; choice: string | null}): Candidate | undefined {
  return element.choice === null
    ? recommendedCandidate(element.candidates)
    : element.candidates.find(candidate => candidate.id === element.choice);
}
