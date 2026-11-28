import {liveBudget, lifecycleVersion, type LiveCollection, type LiveCollectionState, type LiveUpdate} from '../core/lifecycle';
import {locatorIsValid, type LocatorSettings} from '../core/locator';
import type {ElementModel} from '../core/model';
import {discoverComponents} from './components';
import {discoverable, ElementCollection, interactive, inspectable, visible} from './elements';
import type {ApplicationLifecycle, MutationBatch} from './lifecycle';
import {attributeSelector, createDomMatcher} from './validation';

const trackedLimit = 200;
const componentScopes = 3;

export class LiveDiscovery {
  private known = new Map<string, ElementModel>();
  private roots = new Set<Element>();
  private containers = new Set<Element>();
  private tracked = new Set<string>();
  private collections: LiveCollection[] = [];
  private orders = new Map<string, string[]>();
  private paused = false;
  private pendingFull = false;
  private records = 0;
  private timer = 0;
  private deadline = 0;
  private sequence = 0;
  private fullScans = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly lifecycle: ApplicationLifecycle, private readonly collection: ElementCollection,
    private readonly settings: LocatorSettings, private readonly session: string,
    private readonly emit: (update: LiveUpdate) => void) {
    this.unsubscribe = lifecycle.subscribe(batch => this.changed(batch));
  }

  track(ids: unknown, collections: unknown) {
    if (!Array.isArray(ids) || ids.length > trackedLimit ||
      !ids.every(id => typeof id === 'string' && id.startsWith(this.collection.documentKey + ':'))) return;
    let changed = ids.length !== this.tracked.size || ids.some(id => !this.tracked.has(id));
    this.tracked = new Set(ids);
    if (Array.isArray(collections) && collections.length <= 24) {
      const supported = collections.filter(value => value && typeof value.id === 'string' &&
        value.id.length <= 140 && locatorIsValid(value.locator));
      changed ||= JSON.stringify(supported) !== JSON.stringify(this.collections);
      this.collections = supported;
    }
    if (changed && !this.paused) this.schedule();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.clearQueues();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.sync();
  }

  sync() {
    if (!this.paused) {
      this.pendingFull = true;
      this.flush();
    }
  }

  refresh() {
    this.flush();
  }

  close() {
    this.paused = true;
    this.unsubscribe();
    this.clearQueues();
    this.known.clear();
    this.tracked.clear();
    this.orders.clear();
  }

  private changed(batch: MutationBatch) {
    if (this.paused) return;
    this.records = Math.min(liveBudget.records, this.records + batch.records);
    this.pendingFull ||= batch.navigation || batch.overflow;
    for (const root of batch.roots) {
      if (this.roots.size >= liveBudget.roots) {this.pendingFull = true; break;}
      if (root.isConnected) this.roots.add(root);
    }
    for (const parent of batch.containers) {
      if (this.containers.size >= liveBudget.roots) break;
      if (parent.isConnected) this.containers.add(parent);
    }
    this.schedule();
  }

  private schedule() {
    const now = performance.now();
    this.deadline ||= now + liveBudget.maxWaitMs;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), Math.max(0, Math.min(liveBudget.debounceMs, this.deadline - now)));
  }

  private clearQueues() {
    clearTimeout(this.timer);
    this.timer = this.deadline = this.records = 0;
    this.roots.clear();
    this.containers.clear();
  }

  private flush() {
    if (this.paused) return;
    const context = this.lifecycle.context();
    const start = performance.now();
    const full = this.pendingFull;
    const dirty = [...this.roots].filter(node => ![...this.roots].some(other => other !== node && other.contains(node)));
    const containers = [...this.containers].slice(0, componentScopes);
    const records = this.records;
    this.pendingFull = false;
    this.clearQueues();
    if (full) this.fullScans++;

    const build = this.collection.builder(this.settings);
    const targets = new Set<Element>();
    if (full) {
      for (const node of document.querySelectorAll(interactive)) {
        if (discoverable(node)) targets.add(node);
        if (targets.size >= liveBudget.rows) break;
      }
    } else {
      for (const root of dirty) {
        if (discoverable(root)) targets.add(root);
        const control = root.closest(interactive);
        if (control && discoverable(control)) targets.add(control);
        const label = root.closest('label');
        if (label?.control && discoverable(label.control)) targets.add(label.control);
        const nameSource = root.closest('[id]');
        if (nameSource?.id && nameSource.id.length <= 180) {
          const selector = attributeSelector('aria-labelledby', nameSource.id).replace('=', '~=');
          for (const dependent of document.querySelectorAll(selector)) {
            if (discoverable(dependent)) targets.add(dependent);
            if (targets.size >= liveBudget.rows) break;
          }
        }
        for (const node of root.querySelectorAll(interactive)) {
          if (discoverable(node)) targets.add(node);
          if (targets.size >= liveBudget.rows) break;
        }
        if (targets.size >= liveBudget.rows) break;
      }
    }
    // Selected rows can depend on matches or labels outside the dirty subtree.
    // Re-evaluate only the explicitly tracked rows using the shared snapshot.
    for (const ref of this.tracked) {
      const node = this.collection.get(ref);
      if (node && inspectable(node) && visible(node)) targets.add(node);
    }
    const removed: string[] = [];
    for (const [ref] of this.known) {
      const node = this.collection.get(ref);
      if (!node || !visible(node) || (!this.tracked.has(ref) && !discoverable(node))) {
        this.known.delete(ref);
        removed.push(ref);
      }
    }
    for (const ref of this.tracked) {
      const node = this.collection.get(ref);
      if ((!node || !visible(node)) && !removed.includes(ref)) removed.push(ref);
    }
    const upserts: ElementModel[] = [];
    for (const node of targets) {
      const ref = this.collection.id(node);
      if (!this.known.has(ref) && this.known.size >= liveBudget.rows + trackedLimit) continue;
      const row = build(node, !discoverable(node)).row;
      const prior = this.known.get(ref);
      if (full || !prior || JSON.stringify(prior) !== JSON.stringify(row)) upserts.push(row);
      if (discoverable(node) || this.tracked.has(ref)) this.known.set(ref, row);
    }
    if (full) {
      const represented = new Set(upserts.map(row => row.referenceId));
      for (const row of this.known.values()) if (!represented.has(row.referenceId)) upserts.push(row);
    }
    const proposals = containers.flatMap(scope => discoverComponents(this.collection, this.settings, undefined, scope)).slice(0, 12);
    const collections = this.collectionStates();
    const busy = document.readyState === 'loading' || Boolean(document.querySelector('[aria-busy=true]'));
    this.collection.prune();
    this.emit({type: 'update', version: lifecycleVersion, session: this.session, sequence: ++this.sequence, context,
      ready: busy ? 'loading' : this.timer ? 'updating' : 'observed', full, upserts, removed, proposals, collections,
      metrics: {records, roots: dirty.length, fullScans: this.fullScans, durationMs: Math.round(performance.now() - start)}});
  }

  private collectionStates(): LiveCollectionState[] {
    if (!this.collections.length) return [];
    const match = createDomMatcher(document);
    return this.collections.flatMap(collection => {
      try {
        const nodes = match(collection.locator);
        const keys = nodes.slice(0, liveBudget.rows).map(node => this.collection.id(node));
        const old = this.orders.get(collection.id) ?? [];
        const known = new Set(old);
        const retained = new Set(keys);
        const reordered = old.filter(key => retained.has(key)).join('|') !== keys.filter(key => known.has(key)).join('|');
        this.orders.set(collection.id, keys);
        const totalValue = Number(nodes[0]?.closest('[aria-rowcount]')?.getAttribute('aria-rowcount'));
        const total = Number.isSafeInteger(totalValue) && totalValue >= nodes.length && totalValue > 0 ? totalValue : undefined;
        const business = nodes.slice(0, liveBudget.rows).flatMap(node => {
          const key = node.getAttribute('data-row-key') || node.getAttribute('data-testid') || node.id;
          return key ? [key] : [];
        });
        return [{id: collection.id, rendered: nodes.length, total, virtual: !!total && total > nodes.length,
          reordered, duplicateKeys: new Set(business).size !== business.length}];
      } catch {
        return [];
      }
    });
  }
}
