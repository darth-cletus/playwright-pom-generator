import {sameRevision} from '../core/lifecycle';
import type {ApplicationLifecycle} from './lifecycle';
import {evidenceLifetime, type Correlation} from '../core/runtime';
import type {ElementCollection} from './elements';

const markerPrefix = 'data-pom-validation-';
const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');

export class RuntimeCorrelation {
  private lease?: {marker: Correlation; root: Element; target?: Element; scope?: Element; url: string; changed: boolean; timer: number};
  private unsubscribe?: () => void;
  private expiry = 0;

  constructor(private readonly collection: ElementCollection, private readonly lifecycle: ApplicationLifecycle) {}

  begin(documentKey: string, referenceId?: string, scopeId?: string): Correlation | undefined {
    if (documentKey !== this.collection.documentKey || this.lease) return;
    const target = referenceId ? this.collection.get(referenceId) : undefined;
    if (referenceId && !target) return;
    const scope = scopeId ? this.collection.get(scopeId) : undefined;
    if ((scopeId && !scope) || (scope && target && !scope.contains(target))) return;
    this.lifecycle.flush();
    const root = document.documentElement;
    const marker = {attribute: markerPrefix + hex(), nonce: hex(), target: !!target, root: !!scope, context: this.lifecycle.context()};
    root.setAttribute(marker.attribute, marker.nonce);
    target?.setAttribute(marker.attribute + '-target', marker.nonce);
    scope?.setAttribute(marker.attribute + '-root', marker.nonce);
    this.lease = {marker, root, target, scope, url: location.href, changed: false,
      timer: window.setTimeout(() => this.release(marker.attribute), 19_000)};
    this.watch();
    return marker;
  }

  release(attribute: string): boolean {
    const lease = this.lease;
    if (!lease || lease.marker.attribute !== attribute) return false;
    this.lifecycle.flush();
    this.lease = undefined;
    clearTimeout(lease.timer);
    const checked = sameRevision(lease.marker.context, this.lifecycle.context()) && !lease.changed && lease.url === location.href &&
      lease.root === document.documentElement && (!lease.target || lease.target.isConnected) &&
      (!lease.scope || (lease.scope.isConnected && lease.scope.getAttribute(attribute + '-root') === lease.marker.nonce)) &&
      lease.root.getAttribute(attribute) === lease.marker.nonce &&
      (!lease.target || lease.target.getAttribute(attribute + '-target') === lease.marker.nonce);
    if (lease.root.getAttribute(attribute) === lease.marker.nonce) lease.root.removeAttribute(attribute);
    if (lease.target?.getAttribute(attribute + '-target') === lease.marker.nonce) {
      lease.target.removeAttribute(attribute + '-target');
    }
    if (lease.scope?.getAttribute(attribute + '-root') === lease.marker.nonce) lease.scope.removeAttribute(attribute + '-root');
    for (const name of [attribute, attribute + '-target', attribute + '-root']) {
      for (const clone of document.querySelectorAll(`[${name}="${lease.marker.nonce}"]`)) clone.removeAttribute(name);
    }
    return checked;
  }

  close() {
    if (this.lease) this.release(this.lease.marker.attribute);
    clearTimeout(this.expiry);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private watch() {
    clearTimeout(this.expiry);
    this.unsubscribe ??= this.lifecycle.subscribe(batch => {
      if (this.lease) this.lease.changed = true;
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      void chrome.runtime.sendMessage({
        type: 'POM_RUNTIME_CHANGED', documentKey: this.collection.documentKey, context: batch.context,
      }).catch(() => {});
    });
    this.expiry = window.setTimeout(() => this.close(), evidenceLifetime + 19_000);
  }
}
