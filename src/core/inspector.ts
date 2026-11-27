import {parseSettings, type LocatorSettings} from './locator';
import type {Action, ElementModel, PageModel} from './model';

export const inspectorPort = 'pom-inspector';
export type Mode = 'semantic' | 'exact';
export type Direction = 'parent' | 'child' | 'previous' | 'next' | 'original';
export type InspectorState = 'inactive' | 'starting' | 'active' | 'stopping' | 'error';

export interface TargetDetails {
  id: string;
  tag: string;
  role: string | null;
  explicitRole: string;
  implicitRole: string | null;
  name: string;
  labels: string[];
  attributes: Record<string, string>;
  hierarchy: string[];
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
  focusable: boolean;
  rect: {x: number; y: number; width: number; height: number};
  action: Action;
}

export type InspectorCommand =
  | {type: 'start'; mode: Mode; settings: LocatorSettings; tracked?: string[]}
  | {type: 'mode'; mode: Mode}
  | {type: 'navigate'; direction: Direction; child?: number}
  | {type: 'inspect'; id: string}
  | {type: 'select' | 'clear' | 'stop'}
  | {type: 'track'; ids: string[]; selected: string[]};

export type InspectorEvent =
  | {type: 'active'; documentKey: string}
  | {type: 'stopped'; reason: string}
  | {type: 'error'; message: string}
  | {type: 'target'; details: TargetDetails | null; element?: ElementModel; children?: string[]}
  | {type: 'selected'; page: PageModel}
  | {type: 'stale'; ids: string[]};

export function readSettings(value: unknown): LocatorSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const {testAttributes, playwrightTestAttribute} = value as Partial<LocatorSettings>;
  if (!Array.isArray(testAttributes) || !testAttributes.every(item => typeof item === 'string') ||
      typeof playwrightTestAttribute !== 'string') return;
  try {
    return parseSettings(testAttributes.join(','), playwrightTestAttribute);
  } catch {
    return undefined;
  }
}

const validMode = (mode: unknown): mode is Mode => mode === 'semantic' || mode === 'exact';
const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every(id => typeof id === 'string');

export function readCommand(value: unknown): InspectorCommand | undefined {
  if (!value || typeof value !== 'object') return;
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case 'start': {
      const settings = readSettings(command.settings);
      if (settings && validMode(command.mode) && (command.tracked === undefined || validIds(command.tracked))) {
        return {type: 'start', settings, mode: command.mode, tracked: command.tracked};
      }
      break;
    }
    case 'mode':
      if (validMode(command.mode)) return {type: 'mode', mode: command.mode};
      break;
    case 'inspect':
      if (typeof command.id === 'string') return {type: 'inspect', id: command.id};
      break;
    case 'track':
      if (validIds(command.ids) && validIds(command.selected)) return {type: 'track', ids: command.ids, selected: command.selected};
      break;
    case 'navigate':
      if (['parent', 'child', 'previous', 'next', 'original'].includes(command.direction as string) &&
        (command.child === undefined || (Number.isInteger(command.child) && Number(command.child) >= 0))) {
        return {type: 'navigate', direction: command.direction as Direction, child: command.child as number | undefined};
      }
      break;
    case 'select':
    case 'clear':
    case 'stop':
      return {type: command.type};
  }
}
