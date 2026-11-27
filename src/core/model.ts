import type {Candidate} from './locator';
import {currentEvidence} from './runtime';

export type Action = 'click' | 'fill' | 'check' | 'select' | 'read' | 'assert';

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
}

export interface PageModel {
  url: string;
  className: string;
  elements: ElementModel[];
  documentKey?: string;
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
  return {...current, url: incoming.url, elements: [...elements, ...latest.values()]};
}

export function serializePage(model: PageModel): string {
  const elements = model.elements.map(element => ({
    ...element,
    candidates: element.candidates.map(candidate => candidate.runtime && (element.stale || !currentEvidence(candidate.runtime))
      ? {...candidate, runtime: {...candidate.runtime, freshness: 'historical'}}
      : candidate),
  }));
  return JSON.stringify({...model, elements}, null, 2);
}

export function archiveValidation(model: PageModel | null): PageModel | null {
  if (!model?.elements.some(element => element.candidates.some(candidate => currentEvidence(candidate.runtime)))) return model;
  return {...model, elements: model.elements.map(element => ({
    ...element, candidates: element.candidates.map(candidate => candidate.runtime?.freshness === 'current'
      ? {...candidate, runtime: {...candidate.runtime, freshness: 'historical'}}
      : candidate),
  }))};
}
