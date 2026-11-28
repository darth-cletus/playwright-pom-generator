import {liveBudget, type ApplicationRevision} from '../core/lifecycle';

export interface MutationBatch {
  context: ApplicationRevision;
  roots: Element[];
  containers: Element[];
  records: number;
  overflow: boolean;
  structural: boolean;
  navigation: boolean;
}

const attributes = new Set(['id', 'class', 'style', 'name', 'role', 'for', 'title', 'alt', 'placeholder', 'type',
  'hidden', 'disabled', 'readonly', 'checked', 'selected', 'open', 'href', 'inert', 'tabindex', 'contenteditable']);
const editable = 'input,textarea,[contenteditable]:not([contenteditable=false i])';
const owned = (element?: Element | null) => Boolean(element?.closest('[data-pom-overlay]'));

function route() {
  return location.pathname.slice(0, 1024);
}

export class ApplicationLifecycle {
  private revision = 0;
  private navigation = 0;
  private locationKey = '';
  private observer?: MutationObserver;
  private listeners = new Set<(batch: MutationBatch) => void>();
  private routeListeners = new Set<() => void>();
  private visualStyles = new WeakMap<Element, string>();
  private hidden = false;
  private navigationEvents = new AbortController();

  constructor(private readonly documentKey: string) {
    this.locationKey = this.locationIdentity();
    const options = {signal: this.navigationEvents.signal};
    window.addEventListener('popstate', this.checkNavigation, options);
    window.addEventListener('hashchange', this.checkNavigation, options);
    this.navigationApi()?.addEventListener('currententrychange', this.checkNavigation, options);
    window.addEventListener('pagehide', () => {
      this.hidden = true;
      this.updateObservation();
    }, options);
    window.addEventListener('pageshow', event => {
      this.hidden = false;
      if (event.persisted) this.navigate();
      this.updateObservation();
    }, options);
  }

  private navigationApi() {
    return (window as Window & {navigation?: EventTarget & {currentEntry?: {id: string; key: string}}}).navigation;
  }

  private locationIdentity() {
    const entry = this.navigationApi()?.currentEntry;
    return JSON.stringify([location.href, entry?.id, entry?.key]);
  }

  context(): ApplicationRevision {
    this.checkNavigation();
    return {documentKey: this.documentKey, route: route(), navigation: this.navigation, revision: this.revision};
  }

  subscribe(listener: (batch: MutationBatch) => void) {
    this.listeners.add(listener);
    this.updateObservation();
    return () => {
      this.listeners.delete(listener);
      this.updateObservation();
    };
  }

  onNavigation(listener: () => void) {
    this.routeListeners.add(listener);
  }

  flush() {
    const pending = this.observer?.takeRecords();
    if (pending?.length) this.mutations(pending);
    this.checkNavigation();
  }

  close() {
    this.listeners.clear();
    this.routeListeners.clear();
    this.updateObservation();
    this.navigationEvents.abort();
  }

  private checkNavigation = () => {
    const key = this.locationIdentity();
    if (key !== this.locationKey) this.navigate(key);
  };

  private navigate(key = this.locationIdentity()) {
    this.locationKey = key;
    this.navigation++;
    for (const listener of this.routeListeners) listener();
    this.publish([], [], 0, false, true, true);
  }

  private stateChange = (event: Event) => {
    if (event.target instanceof Element && !owned(event.target)) this.publish([event.target], [], 1, false, false, false);
  };

  private updateObservation() {
    const observing = this.listeners.size > 0 && !this.hidden;
    if (observing && !this.observer) {
      this.observer = new MutationObserver(this.mutations);
      this.observer.observe(document, {childList: true, subtree: true, attributes: true, characterData: true});
      document.addEventListener('change', this.stateChange, true);
      document.addEventListener('toggle', this.stateChange, true);
    } else if (!observing && this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
      document.removeEventListener('change', this.stateChange, true);
      document.removeEventListener('toggle', this.stateChange, true);
    }
  }

  private relevantAttribute(element: Element, name: string): boolean {
    if (name.startsWith('data-pom-') || /^data-(?:value|password|token|secret)/.test(name)) return false;
    if (name === 'style') {
      if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
      const value = [element.style.display, element.style.visibility, element.style.contentVisibility].join('|');
      const previous = this.visualStyles.get(element) ?? '||';
      this.visualStyles.set(element, value);
      return value !== previous;
    }
    return attributes.has(name) || name.startsWith('aria-') || name.startsWith('data-');
  }

  private mutations = (records: MutationRecord[]) => {
    const roots = new Set<Element>();
    const containers = new Set<Element>();
    let structural = false;
    let relevant = 0;
    const max = liveBudget.records;
    for (const record of records.slice(0, max)) {
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!element || owned(element)) continue;
      if (record.type === 'attributes' && !this.relevantAttribute(element, record.attributeName ?? '')) continue;
      if (record.type === 'characterData' && element.closest(editable)) continue;
      if (record.type === 'childList') {
        if (element.closest(editable)) continue;
        const nodes = [...record.addedNodes, ...record.removedNodes].filter(node => !(node instanceof Element && owned(node)));
        if (!nodes.length) continue;
        const elementsChanged = nodes.some(node => node instanceof Element);
        structural ||= elementsChanged;
        for (const node of record.addedNodes) {
          if (node instanceof Element && !owned(node) && roots.size < liveBudget.roots) roots.add(node);
        }
        if (elementsChanged) {
          if (containers.size < liveBudget.roots) containers.add(element);
          if (element.closest('button,a[href],label,[aria-labelledby],[role]') && roots.size < liveBudget.roots) roots.add(element);
          relevant++;
          continue;
        }
      }
      if (roots.size < liveBudget.roots) roots.add(element);
      relevant++;
    }
    const overflow = records.length > max || roots.size >= liveBudget.roots || containers.size >= liveBudget.roots;
    if (relevant || overflow) this.publish([...roots], [...containers], Math.min(records.length, max), overflow, structural, false);
  };

  private publish(roots: Element[], containers: Element[], records: number, overflow: boolean, structural: boolean, navigation: boolean) {
    this.revision++;
    const context = {documentKey: this.documentKey, route: route(), navigation: this.navigation, revision: this.revision};
    for (const listener of [...this.listeners]) listener({context, roots, containers, records, overflow, structural, navigation});
  }
}
