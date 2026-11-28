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
export const discoverable = (element: Element) => element instanceof HTMLElement &&
  inspectable(element) && element.matches(interactive) && visible(element);

const identityAttributes = ['id', 'data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy',
  'data-automation-id', 'data-key', 'data-row-key', 'data-id', 'aria-rowindex'];

function nodeIdentity(element: Element): string {
  const item = element.closest('tr,[role=row],[data-row-key]');
  const identity = (node: Element) => {
    const values = identityAttributes.slice(0, -1).map(name => node.getAttribute(name));
    return values.some(Boolean) ? values : [node.getAttribute('aria-rowindex')];
  };
  return JSON.stringify([identity(element), item && item !== element ? identity(item) : []]);
}

function scopeKey(element: Element): string | undefined {
  const item = element.closest('tr,[role=row],[data-row-key]');
  const businessKey = item?.getAttribute('data-row-key') || item?.getAttribute('data-key') ||
    item?.getAttribute('data-id') || item?.getAttribute('aria-rowindex');
  const parent = element.parentElement?.closest('[data-testid],[id]');
  const key = parent?.getAttribute('data-testid') || parent?.id;
  if (!parent || !key) return;
  if (item && !businessKey) return;
  return JSON.stringify([parent.localName, key.slice(0, 180), businessKey?.slice(0, 180)]);
}

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
  private readonly ids = new WeakMap<Element, {id: string; identity: string}>();
  private readonly nodes = new Map<string, {node: WeakRef<Element>; identity: string}>();
  private next = 0;

  id(element: Element) {
    const existing = this.ids.get(element);
    const identity = nodeIdentity(element);
    if (existing?.identity === identity && this.nodes.has(existing.id)) return existing.id;
    if (existing) this.nodes.delete(existing.id);
    const id = `${this.documentKey}:${++this.next}`;
    this.ids.set(element, {id, identity});
    this.nodes.set(id, {node: new WeakRef(element), identity});
    return id;
  }

  get(id: string): Element | undefined {
    const entry = this.nodes.get(id);
    const element = entry?.node.deref();
    if (entry && element?.isConnected && entry.identity === nodeIdentity(element)) return element;
    if (element?.isConnected) this.nodes.delete(id);
    return undefined;
  }

  prune() {
    for (const [id, reference] of this.nodes) {
      if (!reference.node.deref()) this.nodes.delete(id);
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
        selected: picked || metadata.defaultSelected, choice: null, scopeKey: scopeKey(element),
      };
      return {row, metadata};
    };
  }

  scan(settings: LocatorSettings) {
    this.prune();
    const build = this.builder(settings);
    return this.page(Array.from(document.querySelectorAll(interactive))
      .filter(discoverable)
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
