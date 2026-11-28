import {containsInContext, accessibleDocuments, openTrees} from './contexts';
import {interactive, inspectable} from './elements';
import {createDomMatcher} from './validation';
import type {Locator} from '../core/locator';
import {readRecordedStep, workflowLimit, type RecordedAction, type RecordedStep, type RecordingEvent} from '../core/workflow';

function structural(node: Element): Locator | undefined {
  const segments: string[] = [];
  for (let current: Element | null = node; current; current = current.parentElement) {
    const parent = current.parentNode;
    if (!parent || !('children' in parent) || !/^[a-z][a-z0-9-]{0,63}$/.test(current.localName) || segments.length >= 30) return;
    const index = Array.prototype.indexOf.call(parent.children, current) + 1;
    segments.unshift(`${current.localName}:nth-child(${index})`);
  }
  return {strategy: 'css', selector: segments.join(' > ')};
}

function targetLocator(element: Element): Locator | undefined {
  let locator = structural(element);
  let target = element;
  for (let depth = 0; locator && depth <= 4; depth++) {
    const tree = target.getRootNode();
    const host = 'host' in tree ? (tree as ShadowRoot).host : undefined;
    const owner = host ?? target.ownerDocument.defaultView?.frameElement;
    if (!owner) return target.ownerDocument === document ? locator : undefined;
    const root = structural(owner);
    if (!root) return;
    locator = {strategy: host ? 'chain' : 'frame', root, child: locator};
    target = owner;
  }
}

const textInputs = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'time', 'month', 'week', 'datetime-local']);
type RelativeEvent = RecordingEvent extends infer Event ? Event extends RecordingEvent ? Omit<Event, 'version' | 'session'> : never : never;

export class Recorder {
  private bindings = new Map<Document | ShadowRoot | Element, AbortController>();
  private seen = new WeakSet<Event>();
  private uploadIntents = new WeakSet<Element>();
  private pending?: {target: Element; step: RecordedStep};
  private lastTarget?: WeakRef<Element>;
  private timer = 0;
  private sequence = 0;
  private banner?: HTMLElement;
  private matcher?: ReturnType<typeof createDomMatcher>;
  private state: 'recording' | 'paused' | 'stopped' = 'paused';

  constructor(private readonly emit: (event: RelativeEvent) => void) {}

  resume() {
    if (this.state === 'recording' || this.state === 'stopped') return;
    this.state = 'recording';
    this.refresh();
    const banner = document.createElement('div');
    banner.setAttribute('data-pom-overlay', '');
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;inset:8px 8px auto auto;pointer-events:none;z-index:2147483647;background:#991b1b;color:#fff;padding:6px 10px;font:14px sans-serif;';
    banner.attachShadow({mode: 'closed'}).textContent = 'Page Object Generator is recording';
    document.documentElement.append(banner);
    this.banner = banner;
    this.emit({type: 'state', state: 'recording'});
  }

  pause() {
    if (this.state !== 'recording') return;
    this.flush();
    if (this.state !== 'recording') return;
    this.state = 'paused';
    this.cleanup();
    this.emit({type: 'state', state: 'paused'});
  }

  stop(state: 'stopped' | 'limit' = 'stopped') {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    this.cleanup();
    this.emit({type: 'state', state});
  }

  finish() {
    this.flush();
    if (this.state !== 'stopped') this.stop();
  }

  private cleanup() {
    clearTimeout(this.timer);
    this.pending = undefined;
    this.lastTarget = undefined;
    this.matcher = undefined;
    this.uploadIntents = new WeakSet();
    for (const controller of this.bindings.values()) controller.abort();
    this.bindings.clear();
    this.banner?.remove();
    this.banner = undefined;
  }

  refresh = () => {
    if (this.state !== 'recording') return;
    const roots = new Set(accessibleDocuments(document, 16).flatMap(doc => openTrees(doc)).slice(0, 64));
    for (const [root, controller] of this.bindings) {
      if (roots.has(root)) continue;
      controller.abort();
      this.bindings.delete(root);
    }
    for (const root of roots) {
      if (this.bindings.has(root)) continue;
      const controller = new AbortController();
      this.bindings.set(root, controller);
      const options = {capture: true, passive: true, signal: controller.signal};
      for (const type of ['click', 'input', 'change', 'keydown']) root.addEventListener(type, this.receive, options);
      root.addEventListener('load', event => {
        if ((event.target as Element | null)?.localName === 'iframe') this.refresh();
      }, options);
    }
  };

  changed(contexts: boolean) {
    this.matcher = undefined;
    if (contexts) this.refresh();
  }

  navigation() {
    if (this.state !== 'recording') return;
    this.flush();
    this.push({action: 'navigation'});
  }

  assertion() {
    const target = this.lastTarget?.deref();
    if (!target?.isConnected || this.state !== 'recording') return;
    this.flush();
    const step = this.step(target, 'assert');
    if (step) this.push(step);
  }

  private receive = (event: Event) => {
    if (this.state !== 'recording' || !event.isTrusted || this.seen.has(event)) return;
    this.seen.add(event);
    const hit = event.composedPath().find((part): part is Element => (part as Node).nodeType === 1);
    if (!hit || !inspectable(hit) || !containsInContext(document.documentElement, hit)) return;
    const target = hit.closest(interactive + ',button,[contenteditable=true]');
    if (!target || !inspectable(target)) return;
    const type = target.localName === 'input' ? (target as HTMLInputElement).type : '';
    let action: RecordedAction | undefined;
    if (event.type === 'input' && (textInputs.has(type) || target.matches('textarea,[contenteditable=true]'))) action = 'fill';
    if (event.type === 'change') {
      if (type === 'checkbox' || type === 'radio') action = (target as HTMLInputElement).checked ? 'check' : 'uncheck';
      else if (type === 'file' && !this.uploadIntents.delete(target)) action = 'upload';
      else if (target.localName === 'select') action = 'select';
    }
    if (event.type === 'click' && (event as MouseEvent).button === 0 &&
      !target.matches('textarea,select,[contenteditable=true]') && (!type || ['button', 'submit', 'reset', 'image'].includes(type))) {
      action = target.matches('a[download]') ? 'download' : 'click';
    }
    if (event.type === 'click' && (event as MouseEvent).button === 0 && type === 'file') {
      this.uploadIntents.add(target);
      action = 'upload';
    }
    const key = (event as KeyboardEvent).key;
    if (event.type === 'keydown' && (key === 'Escape' || key === 'Enter' && !target.matches('button,a[href],input[type=submit],[role=button]')) &&
      !(event as KeyboardEvent).repeat &&
      !(event as KeyboardEvent).isComposing) action = 'key';
    if (!action) return;
    if (action === 'fill' && this.pending?.target === target && this.pending.step.action === 'fill') {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.flush(), 400);
      return;
    }
    if (action === 'click' && this.pending?.target === target && this.pending.step.action === 'click' &&
      (event as MouseEvent).detail === 2) {
      this.pending.step.action = 'dblclick';
      this.flush();
      return;
    }
    this.flush();
    const step = this.step(target, action, action === 'key' ? key : undefined);
    if (!step) {
      this.emit({type: 'diagnostic', reason: 'target-unavailable'});
      return;
    }
    this.lastTarget = new WeakRef(target);
    if (action === 'fill' || (action === 'click' && (event as MouseEvent).detail === 1)) {
      this.pending = {target, step};
      this.timer = window.setTimeout(() => this.flush(), action === 'fill' ? 400 : 500);
    } else this.push(step);
  };

  private step(target: Element, action: RecordedAction, key?: string): RecordedStep | undefined {
    try {
      const locator = targetLocator(target);
      if (!locator) return;
      this.matcher ??= createDomMatcher(document);
      const matches = this.matcher(locator);
      if (matches.length !== 1 || matches[0] !== target) return;
      return readRecordedStep({action, locator, tag: target.localName, key});
    } catch {
      return;
    }
  }

  private flush() {
    clearTimeout(this.timer);
    const step = this.pending?.step;
    this.pending = undefined;
    if (step) this.push(step);
  }

  private push(step: RecordedStep) {
    if (this.state !== 'recording') return;
    if (this.sequence >= workflowLimit) {this.stop('limit'); return;}
    this.emit({type: 'step', sequence: ++this.sequence, step});
    if (this.sequence === workflowLimit) this.stop('limit');
  }
}
