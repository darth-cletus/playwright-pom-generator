import {expect, it} from 'vitest';
import {generationProfiles} from '../src/core/generation-profile';
import {generate} from '../src/core/python';
import {associateWorkflow, readWorkflow, workflowLimit, workflowModel, type Workflow} from '../src/core/workflow';
import type {Locator} from '../src/core/locator';

const locator: Locator = {strategy: 'css', selector: 'html:nth-child(1) > body:nth-child(2) > input:nth-child(1)'};
const workflow: Workflow = {schemaVersion: 1, name: 'checkout', steps: [
  {action: 'fill', tag: 'input', locator, parameter: 'email', approved: true},
  {action: 'navigation'},
]};

it('keeps only supported structural input in imported workflow data', () => {
  const copy = {...workflow, steps: [{...workflow.steps[0], value: 'sensitive', key: 'secret'}, {action: 'navigation', url: 'private'}]};
  expect(readWorkflow(copy)).toEqual(workflow);
  expect(() => readWorkflow({...workflow, steps: [{action: 'click', tag: 'button',
    locator: {strategy: 'text', value: 'secret'}}]})).toThrow(/target/);
  expect(() => readWorkflow({...workflow, steps: Array(workflowLimit + 1).fill(workflow.steps[0])})).toThrow();
});

it('requires review and emits parameterized sync and async code', () => {
  expect(() => workflowModel({...workflow, steps: [{...workflow.steps[0], approved: false}]})).toThrow(/reviewed/);
  const model = workflowModel(workflow);
  expect(generate(model)).toContain('def checkout(self, *, email: str)');
  expect(generate(model, 'browser', generationProfiles[2])).toContain('await self.step_1.fill(email)');
  expect(generate(model)).not.toContain('goto');
});

it('adds a workflow only to compatible scanned references and reuses their locators', () => {
  const page = workflowModel(workflow);
  page.generation = undefined;
  page.elements[0].referenceId = 'document:1';
  page.elements[0].name = 'email_input';
  expect(() => associateWorkflow(workflow, page, [null, null], [])).toThrow(/compatible scanned/);
  const linked = associateWorkflow(workflow, page, ['document:1', null], []);
  expect(generate(linked)).toContain('self.email_input.fill(email)');
});

it('measures validation and lowering for bounded workflow inputs', () => {
  const draft = {...workflow, steps: Array.from({length: workflowLimit}, () => ({...workflow.steps[0]}))};
  const started = performance.now();
  expect(readWorkflow(draft).steps).toHaveLength(workflowLimit);
  const validated = performance.now() - started;
  const generationStarted = performance.now();
  const code = generate(workflowModel(draft));
  expect(code).toContain('self.step_250.fill(email)');
  console.info(`Workflow workload 250-step validation ${validated.toFixed(1)} ms; 250-action lowering ${(performance.now() - generationStarted).toFixed(1)} ms.`);
});
