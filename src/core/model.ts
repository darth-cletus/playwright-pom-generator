import {usesFrame, type Candidate} from './locator';
import {currentEvidence} from './runtime';
import {modelSchemaVersion, validateComponentGraph, type ComponentDefinition} from './components';
import type {BrowsingContext} from './context';
import type {GenerationOptions} from './generation-profile';

export type Action = 'click' | 'dblclick' | 'fill' | 'clear' | 'press' | 'check' | 'uncheck' | 'select' | 'upload' | 'read' | 'assert';
export const contextSchemaVersion = 3;

export function supportsSchema(version?: number): boolean {
  return version === undefined || version === 1 || version === modelSchemaVersion || version === contextSchemaVersion;
}

export interface ElementModel {
  id: string;
  referenceId?: string;
  name: string;
  label: string;
  tag: string;
  action: Action;
  candidates: Candidate[];
  selected: boolean;
  choice: string | null;
  stale?: boolean;
  availability?: 'available' | 'unavailable';
  observedRoute?: string;
  scopeKey?: string;
  context?: BrowsingContext;
}

export interface PageModel {
  url: string;
  className: string;
  elements: ElementModel[];
  documentKey?: string;
  components?: ComponentDefinition[];
  schemaVersion?: number;
  application?: {route: string; stateLabel?: string};
  contexts?: BrowsingContext[];
  generation?: Partial<GenerationOptions>;
}

export function mergePage(current: PageModel | null, incoming: PageModel): PageModel {
  if (!current || !incoming.documentKey || current.documentKey !== incoming.documentKey) return incoming;
  const latest = new Map(incoming.elements.map(element => [element.referenceId ?? element.id, element]));
  const elements = current.elements.map(element => {
    const reference = element.referenceId ?? element.id;
    const updated = latest.get(reference);
    if (!updated) return element;
    latest.delete(reference);
    return {...updated, id: element.id, name: element.name, choice: element.choice,
      selected: element.selected, action: element.action, candidates: updated.candidates.map((candidate): Candidate => {
        const evidence = element.candidates.find(previous => previous.id === candidate.id)?.runtime;
        return evidence && !candidate.runtime ? {...candidate, runtime: {...evidence, freshness: 'historical'}} : candidate;
      })};
  });
  return {...current, url: incoming.url, contexts: incoming.contexts ?? current.contexts, elements: [...elements, ...latest.values()]};
}

export function serializePage(model: PageModel): string {
  if (!supportsSchema(model.schemaVersion)) {
    throw Error('Unsupported page object schema version.');
  }
  if (model.components?.length) validateComponentGraph(model.components, model.className.trim());
  const elements = model.elements.map(element => ({
    ...element,
    candidates: element.candidates.map(candidate => candidate.runtime && (element.stale || !currentEvidence(candidate.runtime))
      ? {...candidate, runtime: {...candidate.runtime, freshness: 'historical'}}
      : candidate),
  }));
  const components = model.components?.map(definition => ({
    ...definition, runtime: definition.runtime?.map(report => !currentEvidence(report.evidence)
      ? {...report, evidence: {...report.evidence, freshness: 'historical'}} : report),
  }));
  const scopedRow = (row: ElementModel) => !!row.context || row.candidates.some(candidate => usesFrame(candidate.locator));
  const scoped = !!model.contexts?.length || model.elements.some(scopedRow) ||
    !!components?.some(definition => definition.instances.some(instance => scopedRow(instance.root)) ||
      definition.members.some(scopedRow) || definition.children.some(link => usesFrame(link.locator)) ||
      Boolean(definition.collection && usesFrame(definition.collection.locator)));
  const schemaVersion = scoped ? contextSchemaVersion : components?.length ? modelSchemaVersion : model.schemaVersion;
  const exportModel = {...model, schemaVersion, ...(components?.length ? {components} : {}), elements};
  if (!model.application && !scoped) return JSON.stringify(exportModel, null, 2);

  // Live exports are portable model data. Observation references belong to the source document.
  const sessionFields = new Set(['referenceId', 'documentKey', 'scopeKey', 'requestId', 'browserId',
    'applicationRevision', 'parentReference', 'childReferences']);
  return JSON.stringify(exportModel, (key, value) => {
    if (sessionFields.has(key)) return undefined;
    if (key === 'observations' && Array.isArray(value)) {
      return value.filter(observation => !Object.hasOwn(observation, 'parentReference'));
    }
    if (key === 'runtime' && value && !Array.isArray(value)) return {...value, freshness: 'historical'};
    if (key === 'evidence' && value) return {...value, freshness: 'historical'};
    return value;
  }, 2);
}

export function archiveValidation(model: PageModel | null): PageModel | null {
  if (!model || (!model.elements.some(element => element.candidates.some(candidate => currentEvidence(candidate.runtime))) &&
    !model.components?.some(definition => definition.runtime?.some(report => currentEvidence(report.evidence))))) return model;
  return {...model, components: model.components?.map(definition => ({
    ...definition, runtime: definition.runtime?.map(report => ({
      ...report, evidence: {...report.evidence, freshness: 'historical'},
    })),
  })), elements: model.elements.map(element => ({
    ...element, candidates: element.candidates.map(candidate => candidate.runtime?.freshness === 'current'
      ? {...candidate, runtime: {...candidate.runtime, freshness: 'historical'}}
      : candidate),
  }))};
}
