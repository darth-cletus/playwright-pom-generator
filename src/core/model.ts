import type {Candidate} from './locator';

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
      selected: element.selected, action: element.action};
  });
  return {...current, url: incoming.url, elements: [...elements, ...latest.values()]};
}

export function serializePage(model: PageModel): string {
  return JSON.stringify(model, null, 2);
}
