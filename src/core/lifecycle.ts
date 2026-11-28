import type {ComponentDefinition} from './components';
import type {Candidate, Locator, LocatorSettings} from './locator';
import type {ElementModel, PageModel} from './model';

export const lifecyclePort = 'pom-live-v1';
export const lifecycleVersion = 1;
export const liveBudget = {roots: 48, records: 256, rows: 1500, debounceMs: 80, maxWaitMs: 240} as const;

export interface ApplicationRevision {
  documentKey: string;
  route: string;
  navigation: number;
  revision: number;
}

export interface LiveCollection {
  id: string;
  locator: Locator;
}

export interface LiveCollectionState {
  id: string;
  rendered: number;
  total?: number;
  virtual: boolean;
  reordered: boolean;
  duplicateKeys: boolean;
}

export interface LiveMetrics {
  records: number;
  roots: number;
  durationMs: number;
  fullScans: number;
}

export interface LiveUpdate {
  type: 'update';
  version: 1;
  session: string;
  sequence: number;
  context: ApplicationRevision;
  ready: 'loading' | 'updating' | 'observed';
  full: boolean;
  upserts: ElementModel[];
  removed: string[];
  collections: LiveCollectionState[];
  proposals: ComponentDefinition[];
  metrics: LiveMetrics;
}

export type LiveCommand =
  | {type: 'start'; version: 1; session: string; settings: LocatorSettings}
  | {type: 'pause' | 'resume' | 'sync' | 'refresh'; version: 1; session: string}
  | {type: 'track'; version: 1; session: string; ids: string[]; collections: LiveCollection[]};

export function sameRevision(left?: ApplicationRevision, right?: ApplicationRevision): boolean {
  return !!left && !!right && left.documentKey === right.documentKey &&
    left.navigation === right.navigation && left.revision === right.revision;
}

export function nextUpdate(previous: LiveUpdate | undefined, incoming: LiveUpdate): 'accept' | 'ignore' | 'sync' {
  if (incoming.version !== lifecycleVersion || !Number.isSafeInteger(incoming.sequence) || incoming.sequence < 1 ||
    !Number.isSafeInteger(incoming.context?.revision)) return 'ignore';
  if (!previous) return incoming.full ? 'accept' : 'sync';
  if (incoming.session !== previous.session || incoming.context.documentKey !== previous.context.documentKey ||
    incoming.sequence <= previous.sequence || incoming.context.revision < previous.context.revision ||
    incoming.context.navigation < previous.context.navigation) return 'ignore';
  return incoming.full || incoming.sequence === previous.sequence + 1 ? 'accept' : 'sync';
}

export function stableTestId(candidate?: Candidate): boolean {
  return !!candidate && candidate.locator.strategy === 'test-id' && candidate.validation.status === 'unique-target' &&
    candidate.warnings.every(warning => warning === 'Confirm this locator in Playwright.');
}

function stableKey(row: ElementModel): string | undefined {
  const candidate = row.candidates.find(item => stableTestId(item));
  if (!candidate || candidate.locator.strategy !== 'test-id' || !row.scopeKey) return;
  return JSON.stringify([candidate.locator.attribute, candidate.locator.value, row.tag, row.label, row.scopeKey]);
}

export function reconcileLive(page: PageModel | null, update: LiveUpdate, sameDocumentRoute: boolean): PageModel {
  const context = update.context;
  const fresh = new Map(update.upserts.filter(row => row.referenceId).map(row => [row.referenceId!, row]));
  const refreshed = new Set(fresh.keys());
  const removed = new Set(update.removed);
  const byKey = new Map<string, ElementModel[]>();
  const previousCounts = new Map<string, number>();
  if (sameDocumentRoute) {
    for (const row of fresh.values()) {
      const key = stableKey(row);
      if (key) byKey.set(key, [...(byKey.get(key) ?? []), row]);
    }
    for (const row of page?.elements ?? []) {
      const key = stableKey(row);
      if (key) previousCounts.set(key, (previousCounts.get(key) ?? 0) + 1);
    }
  }

  const existing = (page?.elements ?? []).map(row => {
    const unavailable = row.stale || page?.documentKey !== context.documentKey || (row.referenceId &&
      (removed.has(row.referenceId) || (update.full && row.availability === 'available' && !fresh.has(row.referenceId))));
    let match = row.referenceId ? fresh.get(row.referenceId) : undefined;
    const key = unavailable && !match ? stableKey(row) : undefined;
    if (key && previousCounts.get(key) === 1 && byKey.get(key)?.length === 1) {
      const next = byKey.get(key)![0];
      if (next.referenceId && fresh.has(next.referenceId)) match = next;
    }
    if (!match) return unavailable ? {...row, stale: true, availability: 'unavailable' as const} : row;
    fresh.delete(match.referenceId!);
    return {...match, id: row.id, name: row.name, selected: row.selected, action: row.action,
      choice: row.choice, availability: 'available' as const, stale: false,
      observedRoute: context.route, candidates: match.candidates.map(candidate => {
        const previous = row.candidates.find(item => item.id === candidate.id);
        return {...candidate, runtime: previous?.runtime ? {...previous.runtime, freshness: 'historical' as const} : undefined,
          priorCount: previous?.validation.count !== candidate.validation.count ? previous?.validation.count : previous?.priorCount};
      })};
  });
  const used = new Set(existing.map(row => row.id));
  const added = [...fresh.values()].map(row => {
    const id = used.has(row.id) ? row.referenceId! : row.id;
    return {...row, id, selected: false, availability: 'available' as const, observedRoute: context.route};
  });
  const components = page?.components?.map(definition => ({
    ...definition,
    instances: definition.instances.map(instance => {
      const reference = instance.root.referenceId;
      if (reference && refreshed.has(reference)) {
        return {...instance, root: {...instance.root, stale: false, availability: 'available' as const}};
      }
      return reference && (removed.has(reference) || page?.documentKey !== context.documentKey)
        ? {...instance, root: {...instance.root, stale: true, availability: 'unavailable' as const}} : instance;
    }),
  }));
  return {...page, url: page?.url ?? context.route, className: page?.className ?? 'GeneratedPage',
    elements: [...existing, ...added], components, documentKey: context.documentKey,
    application: {...page?.application, route: context.route}};
}
