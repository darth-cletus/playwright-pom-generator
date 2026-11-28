import type {Locator} from '../core/locator';

export type Tree = Document | Element | ShadowRoot;

export function attributeSelector(attribute: string, value: string): string {
  return `[${CSS.escape(attribute)}="${Array.from(value, char =>
    /["\\\u0000-\u001f\u007f]/.test(char) ? `\\${char.codePointAt(0)!.toString(16)} ` : char).join('')}"]`;
}

export function parentInContext(node: Element): Element | null {
  if (node.assignedSlot) return node.assignedSlot;
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return 'host' in root ? (root as ShadowRoot).host : node.ownerDocument.defaultView?.frameElement ?? null;
}

export function accessibleDocuments(top: Document, limit = 24): Document[] {
  const documents = [top];
  for (let index = 0; index < documents.length && documents.length < limit; index++) {
    for (const tree of openTrees(documents[index])) {
      for (const owner of tree.querySelectorAll('iframe')) {
        const child = frameDocument(owner);
        if (child && documents.length < limit) documents.push(child);
      }
    }
  }
  return documents;
}

export function containsInContext(scope: Element, node: Element): boolean {
  if (scope.contains(node)) return true;
  for (let current = parentInContext(node); current; current = parentInContext(current)) {
    if (current === scope) return true;
  }
  return false;
}

export function openTrees(scope: Tree, limit = 64): Tree[] {
  const trees: Tree[] = [scope];
  for (let index = 0; index < trees.length && trees.length < limit; index++) {
    const current = trees[index];
    if ('shadowRoot' in current && current.shadowRoot) trees.push(current.shadowRoot);
    for (const node of current.querySelectorAll('*')) {
      if (trees.length >= limit) break;
      if (node.shadowRoot) trees.push(node.shadowRoot);
    }
  }
  return trees;
}

export function frameDocument(owner: Element): Document | null {
  if (owner.localName !== 'iframe') return null;
  try {
    const child = (owner as HTMLIFrameElement).contentDocument;
    const source = owner.getAttribute('src');
    if (source && !owner.hasAttribute('srcdoc') && child?.URL === 'about:blank' && source !== 'about:blank') return null;
    return child;
  } catch {
    return null;
  }
}

export function boundaryLocators(owner: Element, testAttribute: string): Locator[] {
  const tag = CSS.escape(owner.localName);
  const result: Locator[] = [];
  for (const key of new Set([testAttribute, 'id', 'name', 'title'])) {
    const value = owner.getAttribute(key);
    if (!value || value.length > 200) continue;
    result.push({strategy: 'css', selector: tag + attributeSelector(key, value)});
  }
  result.push({strategy: 'css', selector: tag});
  return result;
}

export function viewportRect(element: Element): DOMRect {
  const rect = element.getBoundingClientRect();
  let doc = element.ownerDocument;
  while (doc !== document) {
    const owner = doc.defaultView?.frameElement as HTMLElement | null;
    if (!owner || frameDocument(owner) !== doc) return new DOMRect();
    const boundary = owner.getBoundingClientRect();
    const x = boundary.width / (owner.offsetWidth || 1);
    const y = boundary.height / (owner.offsetHeight || 1);
    rect.x = boundary.left + (owner.clientLeft + rect.x) * x;
    rect.y = boundary.top + (owner.clientTop + rect.y) * y;
    rect.width *= x;
    rect.height *= y;
    doc = owner.ownerDocument;
  }
  return rect;
}
