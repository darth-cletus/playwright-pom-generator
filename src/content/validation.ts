import {locatorKey, type Locator, type Validation, type ValidationMethod} from '../core/locator';
import {accessibleName, accessibleRole, associatedLabels, isInaccessible, normalize, pageText} from './accessibility';
import {attributeSelector, containsInContext, frameDocument, openTrees, type Tree} from './contexts';
export {attributeSelector} from './contexts';

export type LocatorValidator = (locator: Locator, target: Element) => Validation;

export function classifyMatches(matches: readonly Element[], target: Element, method: ValidationMethod): Validation {
  const count = matches.length;
  const matchesTarget = matches.includes(target);
  return {
    count, matchesTarget, method,
    status: count === 0 ? 'no-match' : !matchesTarget ? 'wrong-target' : count > 1 ? 'ambiguous' : 'unique-target',
  };
}

export function createDomMatcher(document: Document, text = new WeakMap<Element, string>()) {
  const caches = new WeakMap<Tree, Map<string, Element[]>>();
  const elementsByScope = new WeakMap<Tree, Element[]>();
  const indexesByScope = new WeakMap<Tree, Map<string, Map<string, Element[]>>>();
  const trees = new WeakMap<Tree, Tree[]>();
  function query(scope: Tree, selector: string) {
    let roots = trees.get(scope);
    if (!roots) {roots = openTrees(scope); trees.set(scope, roots);}
    return roots.flatMap(root => Array.from(root.querySelectorAll(selector)));
  }

  function semanticIndex(strategy: string, scope: Tree): Map<string, Element[]> {
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
      elements = query(scope, '*');
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

  function match(locator: Locator, scope: Tree = document): Element[] {
      let queryCache = caches.get(scope);
      if (!queryCache) {queryCache = new Map(); caches.set(scope, queryCache);}
      const key = locatorKey(locator);
      let matches = queryCache.get(key);
      if (!matches) {
        switch (locator.strategy) {
          case 'css':
            matches = query(scope, locator.selector);
            break;
          case 'chain': {
            const roots = match(locator.root, scope);
            matches = roots.length === 1 ? match(locator.child, roots[0]) : [];
            break;
          }
          case 'frame': {
            const roots = match(locator.root, scope);
            const child = roots.length === 1 ? frameDocument(roots[0]) : null;
            matches = child ? match(locator.child, child) : [];
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
            matches = query(scope, attributeSelector(locator.attribute, locator.value));
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
            matches = query(scope, `[${attribute}]`).filter(
              element => normalize(element.getAttribute(attribute) ?? '') === locator.value);
          }
        }
        if (scope.nodeType === 1 && !['chain', 'frame', 'filter', 'index'].includes(locator.strategy)) {
          matches = matches.filter(element => element !== scope && containsInContext(scope as Element, element));
        }
        queryCache.set(key, matches);
      }
      return matches;
  }
  return match;
}

export function createDomValidator(document: Document, text = new WeakMap<Element, string>(), scope?: Tree): LocatorValidator {
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
