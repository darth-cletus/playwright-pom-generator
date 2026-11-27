import {locatorKey, type Locator, type Validation, type ValidationMethod} from '../core/locator';
import {accessibleName, accessibleRole, associatedLabels, isInaccessible, normalize, pageText} from './accessibility';

export type LocatorValidator = (locator: Locator, target: Element) => Validation;

export function attributeSelector(attribute: string, value: string): string {
  return `[${CSS.escape(attribute)}="${Array.from(value, char =>
    /["\\\u0000-\u001f\u007f]/.test(char) ? `\\${char.codePointAt(0)!.toString(16)} ` : char).join('')}"]`;
}

export function classifyMatches(matches: readonly Element[], target: Element, method: ValidationMethod): Validation {
  const count = matches.length;
  const matchesTarget = matches.includes(target);
  return {
    count, matchesTarget, method,
    status: count === 0 ? 'no-match' : !matchesTarget ? 'wrong-target' : count > 1 ? 'ambiguous' : 'unique-target',
  };
}

export function createDomValidator(document: Document, text = new WeakMap<Element, string>()): LocatorValidator {
  const queryCache = new Map<string, Element[]>();
  let elements: Element[] | undefined;
  const indexes = new Map<string, Map<string, Element[]>>();

  function semanticIndex(strategy: string): Map<string, Element[]> {
    const cached = indexes.get(strategy);
    if (cached) return cached;
    const index = new Map<string, Element[]>();
    function add(key: string, element: Element) {
      const matches = index.get(key);
      if (matches) matches.push(element);
      else index.set(key, [element]);
    }
    elements ??= Array.from(document.querySelectorAll('*'));
    for (const element of elements) {
      switch (strategy) {
        case 'role': {
          const role = accessibleRole(element);
          if (role && !isInaccessible(element)) add(JSON.stringify([role, accessibleName(element)]), element);
          break;
        }
        case 'label':
          for (const label of associatedLabels(element, text)) add(label, element);
          break;
        case 'text': {
          const value = normalize(pageText(element, text));
          if (value && !Array.from(element.children).some(child => normalize(pageText(child, text)) === value)) {
            add(value, element);
          }
          break;
        }
      }
    }
    indexes.set(strategy, index);
    return index;
  }

  return (locator, target) => {
    const method = locator.strategy === 'css' ? 'dom-css' : 'semantic-approximation';
    try {
      const key = locatorKey(locator);
      let matches = queryCache.get(key);
      if (!matches) {
        switch (locator.strategy) {
          case 'css':
            matches = Array.from(document.querySelectorAll(locator.selector));
            break;
          case 'test-id':
            matches = Array.from(document.querySelectorAll(attributeSelector(locator.attribute, locator.value)));
            break;
          case 'role':
            matches = semanticIndex('role').get(JSON.stringify([locator.role, locator.name])) ?? [];
            break;
          case 'label':
          case 'text':
            matches = semanticIndex(locator.strategy).get(locator.value) ?? [];
            break;
          default: {
            const attribute = locator.strategy === 'alt' ? 'alt' : locator.strategy;
            matches = Array.from(document.querySelectorAll(`[${attribute}]`)).filter(
              element => normalize(element.getAttribute(attribute) ?? '') === locator.value);
          }
        }
        queryCache.set(key, matches);
      }
      return classifyMatches(matches, target, method);
    } catch {
      return {method, status: 'error'};
    }
  };
}
