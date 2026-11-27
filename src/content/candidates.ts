import {locatorKey, recommendedCandidate, type Locator, type LocatorSettings} from '../core/locator';
import {instability, rankCandidates, scoreCandidate, type Proposal} from '../core/scoring';
import {normalize} from './accessibility';
import type {extractMetadata} from './metadata';
import {attributeSelector, type LocatorValidator} from './validation';

function structuralSelector(element: Element, root?: Element): string {
  const parts: string[] = [];
  for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
    const siblings = current.parentElement?.children;
    const index = siblings ? Array.prototype.indexOf.call(siblings, current) + 1 : 1;
    parts.unshift(`${CSS.escape(current.localName)}:nth-child(${index})`);
  }
  return (root ? ':scope > ' : '') + parts.join(' > ');
}

export function generateCandidates(
  element: Element,
  metadata: ReturnType<typeof extractMetadata>,
  settings: LocatorSettings,
  validate: LocatorValidator,
  root?: Element,
) {
  const proposals = new Map<string, Proposal>();
  function add(locator: Locator, basis: string, priority: Proposal['priority'], unstable?: string, order?: number) {
    const key = locatorKey(locator);
    if (!proposals.has(key)) proposals.set(key, {locator, basis, priority, unstable, order});
  }
  function css(selector: string, basis: string, priority: Proposal['priority'], unstable?: string, order?: number) {
    add({strategy: 'css', selector}, basis, priority, unstable, order);
  }

  const configured = settings.playwrightTestAttribute;
  const testId = element.getAttribute(configured);
  if (testId) add({strategy: 'test-id', attribute: configured, value: testId}, configured, 'testId', instability(testId));
  settings.testAttributes.filter(attribute => attribute !== configured).forEach((attribute, index) => {
    const value = element.getAttribute(attribute);
    if (value) css(attributeSelector(attribute, value), attribute, 'alternativeTestId', instability(value), index);
  });

  const {tag, role, name, labels, exactText} = metadata;
  if (role && name) add({strategy: 'role', role, name}, 'Role and accessible name', 'role');
  for (const label of labels) add({strategy: 'label', value: label}, 'Associated label', 'label');
  for (const strategy of ['placeholder', 'alt', 'title'] as const) {
    const value = normalize(element.getAttribute(strategy) ?? '');
    if (value) add({strategy, value}, strategy === 'alt' ? 'Alternative text' : strategy, strategy);
  }
  if (exactText && exactText.length <= 200) add({strategy: 'text', value: exactText}, 'Exact text', 'text');

  for (const attribute of ['id', 'name'] as const) {
    const value = element.getAttribute(attribute);
    if (value) css(attributeSelector(attribute, value), attribute, attribute, instability(value));
  }
  const stableAttributes = ['name', 'type', 'aria-label', 'placeholder'].flatMap(attribute => {
    const value = element.getAttribute(attribute);
    return value && !instability(value) ? [attributeSelector(attribute, value)] : [];
  });
  if (stableAttributes.length >= 2) {
    css(CSS.escape(tag) + stableAttributes.join(''), 'CSS attribute combination', 'combination');
  }
  for (const className of Array.from(element.classList).slice(0, 5)) {
    css('.' + CSS.escape(className), 'CSS class', 'className', instability(className));
  }

  const evaluate = (proposal: Proposal) => scoreCandidate(proposal, validate(proposal.locator, element));
  const candidates = rankCandidates(Array.from(proposals.values(), evaluate));
  if (!recommendedCandidate(candidates)) {
    const locator: Locator = {strategy: 'css', selector: structuralSelector(element, root)};
    candidates.push(evaluate({locator, basis: 'Structural fallback', priority: 'structural'}));
    rankCandidates(candidates);
  }
  return candidates;
}
