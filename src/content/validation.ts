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

export function createDomMatcher(document: Document, text = new WeakMap<Element, string>()) {
  const caches = new WeakMap<Document | Element, Map<string, Element[]>>();
  const elementsByScope = new WeakMap<Document | Element, Element[]>();
  const indexesByScope = new WeakMap<Document | Element, Map<string, Map<string, Element[]>>>();

  function semanticIndex(strategy: string, scope: Document | Element): Map<string, Element[]> {
    let indexes = indexesByScope.get(scope);
    if (!indexes) {indexes = new Map(); indexesByScope.set(scope, indexes);}
    const cached = indexes.get(strategy);
    if (cached) return cached;
    const index = new Map<string, Element[]>();
    function add(key: string, element: Element) {
      const matches = index.get(key);
      if (matches) matches.push(element);
      else index.set(key, [element]);
    }
    let elements = elementsByScope.get(scope);
    if (!elements) {
      elements = Array.from(scope.querySelectorAll('*'));
      elementsByScope.set(scope, elements);
    }
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

  function match(locator: Locator, scope: Document | Element = document): Element[] {
      let queryCache = caches.get(scope);
      if (!queryCache) {queryCache = new Map(); caches.set(scope, queryCache);}
      const key = locatorKey(locator);
      let matches = queryCache.get(key);
      if (!matches) {
        switch (locator.strategy) {
          case 'css':
            matches = Array.from(scope.querySelectorAll(locator.selector));
            break;
          case 'chain': {
            const roots = match(locator.root, scope);
            matches = roots.length === 1 ? match(locator.child, roots[0]) : [];
            break;
          }
          case 'filter':
            matches = match(locator.base, scope).filter(element => locator.has
              ? match(locator.has, element).length > 0
              : normalize(pageText(element, text)).toLowerCase().includes(normalize(locator.text ?? '').toLowerCase()));
            break;
          case 'index':
            matches = match(locator.base, scope).slice(locator.index, locator.index + 1);
            break;
          case 'test-id':
            matches = Array.from(scope.querySelectorAll(attributeSelector(locator.attribute, locator.value)));
            break;
          case 'role':
            matches = semanticIndex('role', scope).get(JSON.stringify([locator.role, locator.name])) ?? [];
            break;
          case 'label':
          case 'text':
            matches = semanticIndex(locator.strategy, scope).get(locator.value) ?? [];
            break;
          default: {
            const attribute = locator.strategy === 'alt' ? 'alt' : locator.strategy;
            matches = Array.from(scope.querySelectorAll(`[${attribute}]`)).filter(
              element => normalize(element.getAttribute(attribute) ?? '') === locator.value);
          }
        }
        if (scope !== document) matches = matches.filter(element => element !== scope && scope.contains(element));
        queryCache.set(key, matches);
      }
      return matches;
  }
  return match;
}

export function createDomValidator(document: Document, text = new WeakMap<Element, string>(), scope?: Element): LocatorValidator {
  const match = createDomMatcher(document, text);
  return (locator, target) => {
    const method = locator.strategy === 'css' ? 'dom-css' : 'semantic-approximation';
    try {
      return classifyMatches(match(locator, scope), target, method);
    } catch {
      return {method, status: 'error'};
    }
  };
}
