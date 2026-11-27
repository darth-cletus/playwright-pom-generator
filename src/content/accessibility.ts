import {computeAccessibleName, getRole, isInaccessible} from 'dom-accessibility-api';

export const normalize = (value: string) => value.replace(/[\u200b\u00ad]/g, '').trim().replace(/\s+/g, ' ');

const roles = new Set(('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem').split(' '));
const nativeRoleTags = new Set('a area button dialog h1 h2 h3 h4 h5 h6 img input option select summary table td textarea th tr'.split(' '));

export function accessibleRole(element: Element, implicit = false): string | null {
  const tokens = (implicit ? '' : element.getAttribute('role') ?? '').trim().split(/\s+/);
  const explicit = tokens.find(role => roles.has(role));
  if (explicit && explicit !== 'none' && explicit !== 'presentation') return explicit;

  let role = getRole(element);
  if ((implicit && element.hasAttribute('role')) || (tokens[0] && tokens[0] !== explicit)) {
    if (explicit) return null;
    if (!nativeRoleTags.has(element.localName)) return null;
    const native = element.cloneNode(false) as Element;
    native.removeAttribute('role');
    role = getRole(native);
  }
  if (element.localName === 'input' && role === 'combobox' && !(element as HTMLInputElement).list) {
    return (element as HTMLInputElement).type === 'search' ? 'searchbox' : 'textbox';
  }
  if (role === 'cell' && element.closest('table')?.matches('[role=grid],[role=treegrid]')) return 'gridcell';
  if (role === 'columnheader' && element.getAttribute('scope')?.toLowerCase() === 'row') return 'rowheader';
  return role === 'none' || role === 'presentation' ? null : role;
}

const contentEditable = '[contenteditable]:not([contenteditable=false i])';
const editable = `input:not([type=button i], [type=submit i], [type=reset i], [type=image i]),textarea,select,${contentEditable},[role~=textbox],[role~=searchbox],[role~=spinbutton],[role~=slider],[role~=combobox],[role~=listbox],[aria-valuenow],[aria-valuetext]`;

export function referencedElements(element: Element, attribute: string): Element[] {
  const ids = (element.getAttribute(attribute) ?? '').trim().split(/\s+/).filter(Boolean);
  return ids.flatMap(id => {
    const target = element.ownerDocument.getElementById(id);
    return target ? [target] : [];
  });
}

export function nativeLabels(element: Element): HTMLLabelElement[] {
  return Array.from((element as HTMLInputElement).labels ?? []);
}

// The accessible-name standard can derive names from embedded live control
// values. Skip those sources before calling the library.
function hasEditableSource(element: Element, root: Element, seen: Set<Element>): boolean {
  if (seen.has(element)) return false;
  seen.add(element);
  if (element !== root && (element.matches(editable) || element.closest(contentEditable))) return true;
  const related = [...referencedElements(element, 'aria-labelledby'),
    ...referencedElements(element, 'aria-owns')];
  return [...element.children, ...related].some(child => hasEditableSource(child, root, seen));
}

export function accessibleName(element: Element): string {
  if (element.closest(contentEditable)) return '';
  const seen = new Set<Element>();
  if (hasEditableSource(element, element, seen) ||
      nativeLabels(element).some(label => hasEditableSource(label, element, seen))) return '';
  return normalize(computeAccessibleName(element));
}

export {isInaccessible};

export function pageText(node: Element, cache: WeakMap<Element, string>): string {
  const cached = cache.get(node);
  if (cached !== undefined) return cached;
  let result = '';
  if (node.closest(contentEditable)) {
    cache.set(node, '');
    return '';
  }
  if (node.matches('input:is([type=button i],[type=submit i],[type=reset i])')) {
    result = node.getAttribute('value') ?? '';
  } else if (!node.matches(`script,style,noscript,head,template,${editable}`)) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) result += child.nodeValue ?? '';
      else if (child.nodeType === 1) result += pageText(child as Element, cache);
    }
  }
  cache.set(node, result);
  return result;
}

export function associatedLabels(element: Element, text: WeakMap<Element, string>): string[] {
  const references = referencedElements(element, 'aria-labelledby');
  const ariaLabel = normalize(element.getAttribute('aria-label') ?? '');
  const values = references.length ? references.map(ref => pageText(ref, text))
    : ariaLabel ? [ariaLabel]
      : nativeLabels(element).map(label => pageText(label, text));
  return [...new Set(values.map(normalize).filter(Boolean))];
}
