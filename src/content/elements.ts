import type {Mode, TargetDetails} from '../core/inspector';
import type {LocatorSettings} from '../core/locator';
import type {ElementModel, PageModel} from '../core/model';
import {identifier} from '../core/python-names';
import {accessibleRole} from './accessibility';
import {generateCandidates} from './candidates';
import {extractMetadata} from './metadata';
import {createDomValidator} from './validation';

const roles = 'button checkbox combobox link textbox searchbox radio listbox slider spinbutton switch tab menuitem menuitemcheckbox menuitemradio';
const native = 'button,a[href],input:not([type=hidden]),select,textarea,[contenteditable=true]';
export const interactive = native + ',' + roles.split(' ').map(role => `[role~="${role}"]`).join(',');
const owned = '[data-pom-overlay]';

export const inspectable = (element: Element) => element.isConnected && !element.closest(owned) &&
  !element.matches('script,style,head,meta,link,template,input[type=hidden]');
export const visible = (element: Element) => element.getClientRects().length > 0 &&
  !['hidden', 'collapse'].includes(getComputedStyle(element).visibility);

export function resolveTarget(element: Element, mode: Mode): Element | null {
  if (!inspectable(element)) return null;
  if (mode === 'exact') return element;
  const ancestor = element.closest(`${interactive},label,[tabindex],summary`);
  if (ancestor instanceof HTMLLabelElement && ancestor.control && inspectable(ancestor.control)) return ancestor.control;
  return ancestor ?? element;
}

export function describe(element: Element): string {
  return (element.localName + (element.id ? '#' + element.id : '') +
    Array.from(element.classList).slice(0, 2).map(name => '.' + name).join('')).slice(0, 100);
}

export class ElementCollection {
  readonly documentKey = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-');
  private readonly ids = new WeakMap<Element, string>();
  private readonly nodes = new Map<string, WeakRef<Element>>();
  private next = 0;

  id(element: Element) {
    let id = this.ids.get(element);
    if (!id) {
      id = `${this.documentKey}:${++this.next}`;
      this.ids.set(element, id);
      this.nodes.set(id, new WeakRef(element));
    }
    return id;
  }

  get(id: string): Element | undefined {
    const element = this.nodes.get(id)?.deref();
    return element?.isConnected ? element : undefined;
  }

  prune() {
    for (const [id, reference] of this.nodes) {
      if (!reference.deref()) this.nodes.delete(id);
    }
  }

  page(elements: ElementModel[]): PageModel {
    return {documentKey: this.documentKey, url: location.origin + location.pathname, className: 'GeneratedPage', elements};
  }

  builder(settings: LocatorSettings, scope?: Element) {
    const text = new WeakMap<Element, string>();
    const validate = createDomValidator(document, text, scope);
    return (element: Element, picked = false) => {
      const metadata = extractMetadata(element, text);
      const {label, tag} = metadata;
      const action = picked && !element.matches(`${interactive},summary`) ? 'assert' : metadata.action;
      const referenceId = this.id(element);
      const row: ElementModel & {referenceId: string} = {
        id: 'element-' + referenceId.slice(this.documentKey.length + 1), referenceId,
        name: identifier(label + '_' + (action === 'fill' ? 'input' : tag)),
        label, tag, action, candidates: generateCandidates(element, metadata, settings, validate, scope),
        selected: picked || metadata.defaultSelected, choice: null,
      };
      return {row, metadata};
    };
  }

  scan(settings: LocatorSettings) {
    this.prune();
    const build = this.builder(settings);
    return this.page(Array.from(document.querySelectorAll(interactive))
      .filter(element => element instanceof HTMLElement && inspectable(element) && visible(element))
      .map(element => build(element).row));
  }
}

export function targetDetails(element: Element, row: ElementModel & {referenceId: string},
  metadata: ReturnType<typeof extractMetadata>, settings: LocatorSettings): TargetDetails {
  const hierarchy: string[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) hierarchy.unshift(describe(node));
  const attributes: Record<string, string> = {};
  for (const key of new Set(['id', 'name', 'class', 'placeholder', 'alt', 'title', 'aria-label', 'aria-labelledby',
    'aria-describedby', 'aria-expanded', 'aria-hidden', 'aria-checked', 'aria-selected', 'aria-disabled',
    'aria-readonly', 'aria-required', 'aria-pressed', ...settings.testAttributes, settings.playwrightTestAttribute])) {
    const value = element.getAttribute(key);
    if (value !== null) attributes[key] = value.slice(0, 200);
  }
  const bounds = element.getBoundingClientRect();
  const explicitRole = element.getAttribute('role') ?? '';
  return {
    id: row.referenceId, tag: row.tag, role: metadata.role, explicitRole,
    implicitRole: explicitRole ? accessibleRole(element, true) : metadata.role,
    name: metadata.name.slice(0, 200), labels: metadata.labels.map(label => label.slice(0, 200)),
    attributes, hierarchy, visible: visible(element),
    disabled: element.matches(':disabled,[aria-disabled=true]'),
    readOnly: element.matches('[readonly],[aria-readonly=true]'),
    focusable: !element.matches(':disabled') && (element.matches('[tabindex]') ||
      ((element instanceof HTMLElement || element instanceof SVGElement) && element.tabIndex >= 0)),
    rect: {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height},
    action: row.action,
  };
}
