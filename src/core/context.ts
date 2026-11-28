import {locatorIsValid, type Locator} from './locator';

export interface ContextBoundary {
  kind: 'frame' | 'shadow';
  tag: string;
  owner?: Locator;
}

export interface BrowsingContext {
  path: ContextBoundary[];
  state: 'accessible' | 'unavailable' | 'ambiguous';
  origin?: string;
  external?: boolean;
}

export function scopeLocator(path: readonly ContextBoundary[], target: Locator): Locator | undefined {
  let result = target;
  for (const boundary of [...path].reverse()) {
    if (!boundary.owner) return;
    result = {strategy: boundary.kind === 'frame' ? 'frame' : 'chain', root: boundary.owner, child: result};
  }
  return locatorIsValid(result) ? result : undefined;
}

export function contextLabel(context: BrowsingContext): string {
  return context.path.map(step => step.owner?.strategy === 'css' ? step.owner.selector : step.tag).join(' › ') || 'Top document';
}

export function readContextPath(value: unknown): ContextBoundary[] | undefined {
  if (!Array.isArray(value) || value.length > 4) return;
  if (value.every(step => step && (step.kind === 'frame' || step.kind === 'shadow') &&
    typeof step.tag === 'string' && /^[a-z][a-z0-9-]{0,70}$/.test(step.tag) &&
    step.owner?.strategy === 'css' && locatorIsValid(step.owner))) return value;
}
