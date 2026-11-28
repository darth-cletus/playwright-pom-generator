import {currentEvidence, runtimeRejects, type RuntimeEvidence} from './runtime';

export type Locator =
  | {strategy: 'css'; selector: string}
  | {strategy: 'test-id'; attribute: string; value: string}
  | {strategy: 'role'; role: string; name: string}
  | {strategy: 'label' | 'placeholder' | 'text' | 'alt' | 'title'; value: string}
  | {strategy: 'chain'; root: Locator; child: Locator}
  | {strategy: 'filter'; base: Locator; has: Locator; text?: never}
  | {strategy: 'filter'; base: Locator; text: string; has?: never}
  | {strategy: 'index'; base: Locator; index: number};

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
  runtime?: RuntimeEvidence;
  priorCount?: number;
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
    case 'chain': return JSON.stringify(['chain', locatorKey(locator.root), locatorKey(locator.child)]);
    case 'filter': return JSON.stringify(['filter', locatorKey(locator.base), locator.has ? locatorKey(locator.has) : null, locator.text]);
    case 'index': return JSON.stringify(['index', locatorKey(locator.base), locator.index]);
    default: return JSON.stringify([locator.strategy, locator.value]);
  }
}

export function testIdAttributes(locator: Locator): string[] {
  switch (locator.strategy) {
    case 'test-id': return [locator.attribute];
    case 'chain': return [...testIdAttributes(locator.root), ...testIdAttributes(locator.child)];
    case 'filter': return [...testIdAttributes(locator.base), ...(locator.has ? testIdAttributes(locator.has) : [])];
    case 'index': return testIdAttributes(locator.base);
    default: return [];
  }
}

export function locatorIsValid(locator: Locator, depth = 0): boolean {
  if (!locator || typeof locator !== 'object' || depth > 4) return false;
  const string = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 4096;
  switch (locator.strategy) {
    case 'chain': return locatorIsValid(locator.root, depth + 1) && locatorIsValid(locator.child, depth + 1);
    case 'filter': return locatorIsValid(locator.base, depth + 1) && (locator.has !== undefined
      ? locator.text === undefined && locatorIsValid(locator.has, depth + 1)
      : string(locator.text));
    case 'index': return locatorIsValid(locator.base, depth + 1) && Number.isInteger(locator.index) && locator.index >= 0 && locator.index < 10_000;
    case 'role': return /^[a-z]{1,32}$/.test(locator.role) && string(locator.name);
    case 'test-id': return /^data-[a-z0-9_-]{1,100}$/.test(locator.attribute) && string(locator.value);
    case 'css': {
      if (!string(locator.selector) || /^\s*(?:\/|\.\.|[\w:-]+\s*=)/.test(locator.selector)) return false;
      const structure = locator.selector.replace(/\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
      return !structure.includes('>>') && !/:scope\b(?!\s*>)/i.test(structure);
    }
    case 'label': case 'placeholder': case 'text': case 'alt': case 'title': return string(locator.value);
    default: return false;
  }
}

export function recommendedCandidate(candidates: readonly Candidate[]): Candidate | undefined {
  return candidates
    .filter(candidate => !runtimeRejects(candidate.runtime) &&
      (candidate.validation.status === 'unique-target' || currentEvidence(candidate.runtime)?.status === 'unique-target'))
    .sort((a, b) => b.score - a.score ||
      Number(currentEvidence(b.runtime)?.status === 'unique-target') -
      Number(currentEvidence(a.runtime)?.status === 'unique-target'))[0];
}

export function selectedCandidate(element: {candidates: Candidate[]; choice: string | null}): Candidate | undefined {
  return element.choice === null
    ? recommendedCandidate(element.candidates)
    : element.candidates.find(candidate => candidate.id === element.choice);
}
