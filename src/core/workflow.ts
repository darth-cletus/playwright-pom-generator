import {identifier} from './python-names';
import {locatorIsValid, locatorKey, selectedCandidate, type Locator} from './locator';
import type {GenerationMethod} from './generation-profile';
import type {PageModel} from './model';

export const recordingPort = 'pom-record-v1';
export const workflowLimit = 250;
const actions = ['click', 'dblclick', 'fill', 'clear', 'check', 'uncheck', 'select', 'assert', 'navigation', 'upload', 'download', 'key'] as const;
export type RecordedAction = typeof actions[number];
export interface RecordedStep {
  action: RecordedAction;
  locator?: Locator;
  tag?: string;
  key?: 'Enter' | 'Escape';
  parameter?: string;
  approved?: boolean;
}
export interface Workflow {schemaVersion: 1; name: string; description?: string; steps: RecordedStep[]}
export type RecordingCommand = {version: 1; session: string; type: 'start' | 'pause' | 'resume' | 'stop' | 'assert'};
export type RecordingEvent =
  | {version: 1; session: string; type: 'step'; sequence: number; step: RecordedStep}
  | {version: 1; session: string; type: 'diagnostic'; reason: 'target-unavailable'}
  | {version: 1; session: string; type: 'state'; state: 'recording' | 'paused' | 'stopped' | 'limit'};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const validName = (value: unknown): value is string => typeof value === 'string' &&
  /^[a-z][a-z0-9_]{0,47}$/.test(value) && identifier(value) === value;
const structural = /^(?:[a-z][a-z0-9-]*:nth-child\([1-9]\d{0,4}\))(?: > [a-z][a-z0-9-]*:nth-child\([1-9]\d{0,4}\))*$/;

function readLocator(value: unknown, depth = 0): Locator | undefined {
  if (!object(value) || depth > 4) return;
  if (value.strategy === 'css' && typeof value.selector === 'string' &&
    value.selector.length <= 1024 && structural.test(value.selector)) return {strategy: 'css', selector: value.selector};
  if (value.strategy === 'chain' || value.strategy === 'frame') {
    const root = readLocator(value.root, depth + 1);
    const child = readLocator(value.child, depth + 1);
    if (root && child) return {strategy: value.strategy, root, child};
  }
}

export function readRecordedStep(value: unknown): RecordedStep {
  if (!object(value) || typeof value.action !== 'string' || !(actions as readonly string[]).includes(value.action)) {
    throw Error('Unsupported workflow action.');
  }
  const action = value.action as RecordedAction;
  if (action === 'navigation') return {action};
  const locator = readLocator(value.locator);
  if (!locator || !locatorIsValid(locator) || typeof value.tag !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.tag)) {
    throw Error('Invalid workflow target.');
  }
  if (action === 'key' && value.key !== 'Enter' && value.key !== 'Escape') throw Error('Unsupported recorded key.');
  const parameter = value.parameter;
  if (parameter !== undefined && (!validName(parameter) || !['fill', 'select', 'upload'].includes(action))) {
    throw Error('Invalid workflow parameter name.');
  }
  return {action, locator, tag: value.tag, ...(action === 'key' ? {key: value.key as 'Enter' | 'Escape'} : {}),
    ...(typeof parameter === 'string' ? {parameter} : {}), ...(value.approved === true ? {approved: true} : {})};
}

export function readWorkflow(value: unknown): Workflow {
  if (!object(value) || value.schemaVersion !== 1 || !validName(value.name) ||
    !Array.isArray(value.steps) || value.steps.length > workflowLimit) throw Error('Invalid workflow file.');
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 300)) {
    throw Error('Use a workflow description under 300 characters.');
  }
  return {schemaVersion: 1, name: value.name, ...(typeof value.description === 'string' ? {description: value.description} : {}),
    steps: value.steps.map(readRecordedStep)};
}

export function workflowModel(workflow: Workflow): PageModel {
  const reviewed = readWorkflow(workflow);
  const executable = reviewed.steps.map((step, index) => ({step, index})).filter(({step}) => step.action !== 'navigation');
  if (!executable.length) throw Error('Use at least one reviewed action to generate a method.');
  const method: GenerationMethod = {name: reviewed.name, steps: []};
  const parameters = new Map<string, boolean>();
  const elements: PageModel['elements'] = [];
  executable.forEach(({step, index}) => {
    const id = 'step_' + (index + 1);
    const {locator} = step;
    const action = step.action === 'key' ? 'press' : step.action;
    if (!locator || !step.approved || action === 'download' || action === 'navigation') {
      throw Error(`Step ${index + 1} needs a reviewed target and a supported generation action.`);
    }
    const argument = action === 'fill' || action === 'select' || action === 'upload' ? step.parameter ?? 'value_' + (index + 1) : undefined;
    if (argument) {
      if (parameters.has(argument) && (!step.parameter || !parameters.get(argument))) {
        throw Error('Rename the parameter or explicitly reuse the same name on both input steps.');
      }
      parameters.set(argument, !!step.parameter);
    }
    const candidate = {id: locatorKey(locator), locator, basis: 'Manually reviewed workflow selector', score: 50,
      warnings: ['Depends on DOM order.'], explanations: [], validation: {method: 'dom-css' as const, status: 'unique-target' as const}};
    elements.push({id, name: id, label: step.tag!, tag: step.tag!, action, selected: true, choice: null, candidates: [candidate]});
    method.steps.push({elementId: id, action, argument, ...(step.key ? {key: step.key} : {})});
  });
  return {className: 'RecordedWorkflow', url: '', elements, generation: {interactions: false, assertions: true, methods: [method]}};
}

export function associateWorkflow(workflow: Workflow, page: PageModel, matches: (string | null)[], inherited: GenerationMethod[]): PageModel {
  const method = workflowModel(workflow).generation!.methods![0];
  const referenced = new Set<string>();
  const linked = {...method, steps: method.steps.map(step => {
    const index = Number(step.elementId.slice(5)) - 1;
    const target = page.elements.find(row => row.referenceId === matches[index] && !row.stale);
    const candidate = target && selectedCandidate(target);
    if (!target || !candidate || candidate.validation.status !== 'unique-target' ||
      (target.action !== step.action && step.action !== 'assert')) {
      throw Error(`Step ${index + 1} has no compatible scanned element with a unique locator.`);
    }
    referenced.add(target.id);
    return {...step, elementId: target.id};
  })};
  const methods = page.generation?.methods ?? inherited;
  if (methods.some(item => item.name === linked.name)) throw Error('A configured method already uses this workflow name.');
  return {...page, elements: page.elements.map(row => referenced.has(row.id) ? {...row, selected: true} : row),
    generation: {...page.generation, assertions: true, methods: [...methods, linked]}};
}
