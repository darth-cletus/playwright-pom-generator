import {readCommand, type InspectorCommand, type InspectorEvent, type Mode} from '../core/inspector';
import {recommendedCandidate, type LocatorSettings} from '../core/locator';
import {describe, ElementCollection, inspectable, resolveTarget, targetDetails} from './elements';
import {Highlights} from './highlight';
import {accessibleDocuments, frameDocument, parentInContext} from './contexts';

const gestures = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick'] as const;

export class Inspector {
  private events?: AbortController;
  private frameEvents = new Map<Document, AbortController>();
  private mode: Mode = 'semantic';
  private settings?: LocatorSettings;
  private target?: Element;
  private original?: Element;
  private pending?: Element;
  private frame = 0;
  private settle = 0;
  private watch = 0;
  private tracked = new Set<string>();
  private included = new Set<string>();
  private lastSelected?: Element;
  private previousSelected?: Element;

  constructor(private readonly collection: ElementCollection, private readonly highlights: Highlights,
    private readonly emit: (event: InspectorEvent) => void) {}

  receive(value: unknown) {
    const command = readCommand(value);
    if (!command) {
      this.emit({type: 'error', message: 'Invalid inspector command.'});
      return;
    }
    if (command.type === 'start') {
      this.start(command);
      return;
    }
    if (!this.events) return;
    switch (command.type) {
      case 'stop': this.stop('Inspection stopped.'); break;
      case 'clear': this.pending = undefined; this.point(undefined); break;
      case 'mode': {
        this.mode = command.mode;
        this.point(this.pending ? resolveTarget(this.pending, this.mode) ?? undefined : undefined);
        break;
      }
      case 'select': this.select(); break;
      case 'track': {
        this.tracked = new Set(command.ids);
        this.included = new Set(command.selected);
        if (this.lastSelected && !this.included.has(this.collection.id(this.lastSelected))) {
          this.lastSelected = undefined;
          this.highlights.set('selected');
        }
        if (this.previousSelected && !this.included.has(this.collection.id(this.previousSelected))) {
          this.previousSelected = undefined;
          this.highlights.set('previous');
        }
        this.checkReferences();
        break;
      }
      case 'inspect': {
        const element = this.collection.get(command.id);
        if (element) this.point(element, true);
        else this.emit({type: 'stale', ids: [command.id]});
        break;
      }
      case 'navigate': this.navigate(command); break;
    }
  }

  stop(reason?: string) {
    if (!this.events) return;
    this.events.abort();
    for (const controller of this.frameEvents.values()) controller.abort();
    this.frameEvents.clear();
    this.events = undefined;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.settle);
    clearInterval(this.watch);
    this.frame = 0;
    this.target = this.original = this.pending = this.lastSelected = this.previousSelected = undefined;
    this.tracked.clear();
    this.included.clear();
    this.highlights.clear();
    this.collection.prune();
    if (reason) this.emit({type: 'stopped', reason});
  }

  private start(command: Extract<InspectorCommand, {type: 'start'}>) {
    if (this.events) return;
    this.events = new AbortController();
    this.mode = command.mode;
    this.settings = command.settings;
    this.tracked = new Set(command.tracked);
    const options = {capture: true, signal: this.events.signal};
    window.addEventListener('pointermove', this.move, {...options, passive: true});
    window.addEventListener('keydown', this.key, options);
    window.addEventListener('pagehide', () => this.stop('Page navigated.'), options);
    document.addEventListener('load', this.bindFrames, options);
    for (const event of gestures) window.addEventListener(event, this.gesture, options);
    this.watch = window.setInterval(() => this.checkReferences(), 200);
    this.emit({type: 'active', documentKey: this.collection.documentKey});
    this.bindFrames();
    this.checkReferences();
  }

  private bindFrames = () => {
    const frames = new Set(accessibleDocuments(document).slice(1));
    for (const [frame, controller] of this.frameEvents) {
      if (frames.has(frame)) continue;
      controller.abort();
      this.frameEvents.delete(frame);
    }
    for (const frame of frames) {
      if (this.frameEvents.has(frame)) continue;
      const controller = new AbortController();
      this.frameEvents.set(frame, controller);
      const options = {capture: true, signal: controller.signal};
      frame.addEventListener('pointermove', this.move, {...options, passive: true});
      frame.addEventListener('keydown', this.key, options);
      frame.addEventListener('load', this.bindFrames, options);
      for (const gesture of gestures) frame.addEventListener(gesture, this.gesture, options);
    }
  };

  private checkReferences() {
    if (!globalThis.chrome?.runtime?.id) {
      this.stop();
      return;
    }
    const dead = [...this.tracked].filter(id => !this.collection.get(id));
    for (const id of dead) this.tracked.delete(id);
    if (dead.length) this.emit({type: 'stale', ids: dead});
    if (this.target && !this.collection.get(this.collection.id(this.target))) this.point(undefined);
    if (this.lastSelected && !this.lastSelected.isConnected) this.lastSelected = undefined;
    if (this.previousSelected && !this.previousSelected.isConnected) this.previousSelected = undefined;
  }

  private move = (event: PointerEvent) => {
    const element = this.eventElement(event);
    if (!event.isTrusted || !element || this.pending === element) return;
    this.pending = element;
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.point(this.pending ? resolveTarget(this.pending, this.mode) ?? undefined : undefined);
    });
  };

  private point(element?: Element, pinned = false, preserveOriginal = false) {
    if (this.target === element && !pinned) return;
    clearTimeout(this.settle);
    this.target = element;
    if (!preserveOriginal) this.original = element;
    this.highlights.clearTarget();
    if (!element) {
      this.emit({type: 'target', details: null});
      return;
    }
    this.highlights.set(pinned ? 'target' : 'hover', element);
    this.highlights.describe(describe(element));
    this.settle = window.setTimeout(() => {
      try {
        this.preview(element);
      } catch {
        this.stop();
        this.emit({type: 'error', message: 'The target could not be inspected. Start inspection and try another element.'});
      }
    }, pinned ? 0 : 160);
  }

  private build(element: Element) {
    return this.collection.builderFor(element, this.settings!)(element, true);
  }

  private preview(element: Element, built?: ReturnType<Inspector['build']>) {
    if (!this.events || this.target !== element || !inspectable(element)) return;
    const {row, metadata} = built ?? this.build(element);
    const details = targetDetails(element, row, metadata, this.settings!);
    const candidate = recommendedCandidate(row.candidates);
    const ambiguous = row.candidates.find(option => option.validation.status === 'ambiguous');
    this.highlights.describe([
      `${details.tag}${details.role ? ' · role=' + details.role : ''}`,
      details.name,
      candidate ? `${candidate.locator.strategy} · unique target · ${candidate.validation.method}` : 'No unique locator',
      ambiguous ? `Alternative: ${ambiguous.locator.strategy} · ${ambiguous.validation.count} matches (ambiguous)` : '',
      `${Math.round(details.rect.width)} × ${Math.round(details.rect.height)}${this.included.has(details.id) ?
        ' · selected' : this.tracked.has(details.id) ? ' · in collection' : ''}`,
    ].filter(Boolean).join('\n'));
    this.emit({type: 'target', details, element: row, children: this.children(element).map(describe)});
  }

  private children(element: Element) {
    const slot = element.localName === 'slot' ? (element as HTMLSlotElement).assignedElements({flatten: true}) : [];
    const children = frameDocument(element)?.children ?? element.shadowRoot?.children ?? element.children;
    return (slot.length ? slot : Array.from(children)).filter(inspectable);
  }

  private navigate({direction, child}: Extract<InspectorCommand, {type: 'navigate'}>) {
    if (!this.target) return;
    const parent = parentInContext(this.target);
    const siblings = parent ? this.children(parent) : [];
    const index = siblings.indexOf(this.target);
    const element = direction === 'parent' ? parent : direction === 'child' ? this.children(this.target)[child ?? 0]
      : direction === 'previous' ? siblings[index - 1] : direction === 'next' ? siblings[index + 1] : this.original;
    if (element && inspectable(element)) this.point(element, true, true);
  }

  private select(element = this.target) {
    if (!element || !inspectable(element)) return;
    try {
      const built = this.build(element);
      const {row} = built;
      this.tracked.add(row.referenceId);
      this.included.add(row.referenceId);
      if (this.lastSelected !== element) {
        this.previousSelected = this.lastSelected;
        this.highlights.set('previous', this.previousSelected);
      }
      this.lastSelected = element;
      this.highlights.set('selected', element);
      this.point(element, true, this.target === element);
      clearTimeout(this.settle);
      this.preview(element, built);
      this.emit({type: 'selected', page: this.collection.page([row])});
    } catch {
      this.stop();
      this.emit({type: 'error', message: 'The target could not be selected. Start inspection and try another element.'});
    }
  }

  private gesture = (event: MouseEvent) => {
    const hit = this.eventElement(event);
    if (!event.isTrusted || event.button !== 0 || !hit) return;
    const element = resolveTarget(hit, this.mode);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click') this.select(element);
  };

  private eventElement(event: Event): Element | undefined {
    return event.composedPath().find((node): node is Element => 'nodeType' in node && (node as Node).nodeType === 1);
  }

  private key = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    const editable = this.eventElement(event)?.closest('input,textarea,select,[contenteditable=true]');
    if (event.key !== 'Escape' && (editable || event.key !== 'Enter' || !this.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') this.stop('Inspection stopped with Escape.');
    else this.select();
  };
}
