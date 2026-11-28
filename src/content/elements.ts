import type {Mode, TargetDetails} from '../core/inspector';
import {locatorKey, type LocatorSettings} from '../core/locator';
import type {ElementModel, PageModel} from '../core/model';
import {scopeLocator, type BrowsingContext, type ContextBoundary} from '../core/context';
import {identifier} from '../core/python-names';
import {accessibleRole} from './accessibility';
import {generateCandidates} from './candidates';
import {extractMetadata} from './metadata';
import {createDomMatcher, createDomValidator} from './validation';
import {boundaryLocators, frameDocument, openTrees, parentInContext, type Tree} from './contexts';

const roles = 'button checkbox combobox link textbox searchbox radio listbox slider spinbutton switch tab menuitem menuitemcheckbox menuitemradio';
const native = 'button,a[href],input:not([type=hidden]),select,textarea,[contenteditable=true]';
export const interactive = native + ',' + roles.split(' ').map(role => `[role~="${role}"]`).join(',');
const owned = '[data-pom-overlay]';

export const inspectable = (element: Element) => element.isConnected && !element.closest(owned) &&
  !element.matches('script,style,head,meta,link,template,input[type=hidden]');
export const visible = (element: Element) => element.getClientRects().length > 0 &&
  !['hidden', 'collapse'].includes(element.ownerDocument.defaultView?.getComputedStyle(element).visibility ?? 'hidden');
export const discoverable = (element: Element) => element.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
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
  const control = ancestor?.localName === 'label' ? (ancestor as HTMLLabelElement).control : null;
  if (control && inspectable(control)) return control;
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
    if (entry && element?.isConnected && entry.identity === nodeIdentity(element)) {
      let current = element.ownerDocument;
      while (current !== document) {
        const frame = current.defaultView?.frameElement;
        if (!frame?.isConnected || frameDocument(frame) !== current) return undefined;
        current = frame.ownerDocument;
      }
      return element;
    }
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

  builderFor(element: Element, settings: LocatorSettings, componentRoot?: Element) {
    const path: ContextBoundary[] = [];
    let node = element;
    const tree = element.getRootNode() as Tree;
    const componentTree = componentRoot?.getRootNode();
    const match = createDomMatcher(document);
    for (let depth = 0; depth <= 4; depth++) {
      const root = node.getRootNode();
      if (root === componentTree) break;
      const owner = 'host' in root ? (root as ShadowRoot).host : node.ownerDocument.defaultView?.frameElement;
      if (!owner) break;
      if (owner === componentRoot && 'host' in root) break;
      const kind = 'host' in root ? 'shadow' : 'frame';
      const boundary = boundaryLocators(owner, settings.playwrightTestAttribute).find(locator => {
        const receiver = owner.getRootNode() === componentTree ? componentRoot : undefined;
        const matches = match(locator, receiver ?? owner.getRootNode() as Tree);
        return matches.length === 1 && matches[0] === owner;
      });
      path.unshift({kind, tag: owner.localName, owner: boundary});
      node = owner;
    }
    const context = path.length ? {path, state: path.every(step => step.owner) ? 'accessible' as const : 'ambiguous' as const} : undefined;
    return this.builder(settings, componentRoot && !path.length ? componentRoot : tree, context, componentRoot);
  }

  builder(settings: LocatorSettings, scope?: Tree, context?: BrowsingContext, componentRoot?: Element) {
    const text = new WeakMap<Element, string>();
    const validate = createDomValidator(document, text, scope);
    const checkPath = context && createDomValidator(document, undefined, componentRoot);
    return (element: Element, picked = false) => {
      const metadata = extractMetadata(element, text);
      const {label, tag} = metadata;
      const action = picked && !element.matches(`${interactive},summary`) ? 'assert' : metadata.action;
      const referenceId = this.id(element);
      let candidates = generateCandidates(element, metadata, settings, validate, scope?.nodeType === 1 ? scope as Element : undefined);
      if (context && checkPath) candidates = candidates.flatMap(candidate => {
        const locator = scopeLocator(context.path, candidate.locator);
        if (!locator) return [];
        return [{...candidate, locator, id: locatorKey(locator), validation: checkPath(locator, element)}];
      });
      const row: ElementModel & {referenceId: string} = {
        id: 'element-' + referenceId.slice(this.documentKey.length + 1), referenceId,
        name: identifier(label + '_' + (action === 'fill' ? 'input' : tag)),
        label, tag, action, candidates, context,
        selected: picked || metadata.defaultSelected, choice: null, scopeKey: scopeKey(element),
      };
      return {row, metadata};
    };
  }

  scan(settings: LocatorSettings, rowLimit = Infinity, selectedPath?: ContextBoundary[]) {
    this.prune();
    const match = createDomMatcher(document);
    const contexts: BrowsingContext[] = [];
    const elements: ElementModel[] = [];
    const limit = 64;
    function ownerStep(node: Element, kind: ContextBoundary['kind']): ContextBoundary {
      const scope = kind === 'shadow' ? node.parentElement?.getRootNode() ?? node.ownerDocument : node.ownerDocument;
      const owner = boundaryLocators(node, settings.playwrightTestAttribute).find(locator => {
        const matches = match(locator, scope as Tree);
        return matches.length === 1 && matches[0] === node;
      });
      return {kind, tag: node.localName, owner};
    }
    const visit = (tree: Tree, path: ContextBoundary[]) => {
      const context: BrowsingContext | undefined = path.length ? {path,
        state: path.every(step => step.owner) ? 'accessible' : 'ambiguous'} : undefined;
      if (context) contexts.push(context);
      if (context?.state === 'ambiguous') return;
      const build = this.builder(settings, tree, context);
      for (const element of tree.querySelectorAll(interactive)) {
        if (elements.length >= rowLimit || (path.length && elements.length >= 3000)) break;
        if (discoverable(element)) elements.push(build(element).row);
      }
      if (selectedPath) return;
      if (path.length >= 4 || contexts.length >= limit) return;
      for (const owner of tree.querySelectorAll('*')) {
        if (contexts.length >= limit) break;
        if (owner.shadowRoot) {
          visit(owner.shadowRoot, [...path, ownerStep(owner, 'shadow')]);
        }
        if (owner.localName === 'iframe') {
          const steps = [...path, ownerStep(owner, 'frame')];
          const child = frameDocument(owner);
          if (child) visit(child, steps);
          else {
            const source = owner.getAttribute('src');
            let origin: string | undefined;
            if (source && !owner.hasAttribute('srcdoc') &&
              (!owner.hasAttribute('sandbox') || (owner as HTMLIFrameElement).sandbox.contains('allow-same-origin'))) {
              try {
                const url = new URL(source, owner.ownerDocument.baseURI);
                if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) origin = url.origin;
              } catch {
                // The browser owns parsing and navigation of opaque frame sources.
              }
            }
            contexts.push({path: steps, origin, state: 'unavailable'});
          }
        }
      }
    };
    let tree: Tree = document;
    if (selectedPath) {
      for (const step of selectedPath) {
        if (!step.owner) return this.page([]);
        let owners: Element[];
        try {owners = match(step.owner, tree);} catch {return this.page([]);}
        if (owners.length !== 1 || owners[0].localName !== step.tag) return this.page([]);
        const child = step.kind === 'frame' ? frameDocument(owners[0]) : owners[0].shadowRoot;
        if (!child) return this.page([]);
        tree = child;
      }
    }
    visit(tree, selectedPath ?? []);
    return {...this.page(elements), ...(contexts.length ? {contexts} : {})};
  }
}

export function targetDetails(element: Element, row: ElementModel & {referenceId: string},
  metadata: ReturnType<typeof extractMetadata>, settings: LocatorSettings): TargetDetails {
  const hierarchy: string[] = [];
  for (let node: Element | null = element; node; node = parentInContext(node)) hierarchy.unshift(describe(node));
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
