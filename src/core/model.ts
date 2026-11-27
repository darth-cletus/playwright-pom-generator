import type {Candidate} from './locator';

export type Action = 'click' | 'fill' | 'check' | 'select' | 'read';

export interface ElementModel {
  id: string;
  name: string;
  label: string;
  tag: string;
  action: Action;
  candidates: Candidate[];
  selected: boolean;
  choice: string | null;
}

export interface PageModel {
  url: string;
  className: string;
  elements: ElementModel[];
}

export function serializePage(model: PageModel): string {
  return JSON.stringify(model, null, 2);
}
