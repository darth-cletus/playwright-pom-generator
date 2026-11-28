import {expect, it} from 'vitest';
import {generationProfiles, readGenerationProfile, resolveGeneration} from '../src/core/generation-profile';
import {artifactHashes, generate, generatePackage, generationManifest} from '../src/core/python';
import {pythonPackageZip} from '../src/core/python-package';
import type {PageModel} from '../src/core/model';

const model: PageModel = {className: 'Checkout', url: 'https://example.test/', elements: [
  {id: 'field', name: 'email', label: 'Email', tag: 'input', action: 'fill', selected: true, choice: null,
    candidates: [{id: 'email', locator: {strategy: 'test-id', attribute: 'data-testid', value: 'email'},
      score: 100, basis: 'Test ID', warnings: [], explanations: [], validation: {method: 'dom-css', status: 'unique-target'}}]},
]};

it('resolves successive overrides and round trips saved profile options', () => {
  const profile = generationProfiles[2];
  const options = resolveGeneration(profile.options, {timeoutMs: 1000}, {timeoutMs: 500});
  expect(options.execution).toBe('async');
  expect(options.timeoutMs).toBe(500);
  expect(readGenerationProfile(JSON.parse(JSON.stringify({...profile, options}))).options).toEqual(options);
  expect(readGenerationProfile({...profile, options: {execution: 'async'}}).options.packageName).toBe('generated');
  expect(generate(model, 'browser', generationProfiles[0])).toBe(generate(model));
});

it('separates lazy async locator factories from awaited operations', () => {
  const profile = generationProfiles[3];
  const code = generate(model, 'browser', profile);
  expect(code).toContain('from playwright.async_api import Locator, Page, expect');
  expect(code).toContain('def __init__(self, page: Page)');
  expect(code).toContain('def email(self) -> Locator:');
  expect(code).toContain('return self.page.get_by_test_id("email")');
  expect(code).toContain('await self.email.fill(value)');
});

it('renders framework imports and constructor injection without logging values', () => {
  const profile = generationProfiles[5];
  const code = generate(model, 'browser', profile);
  expect(code).toContain('from framework.base import BasePage as _FrameworkBase');
  expect(code).toContain('super().__init__(page)');
  expect(code).toContain('self._email: Locator');
  expect(code).toContain('self.logger.info("fill _email")');
  expect(code).toContain('self._email.fill(value)');
});

it('rejects unsafe options and renders header templates as comments', () => {
  expect(() => resolveGeneration({baseModule: 'os; import sys', baseClass: 'Page'})).toThrow(/base class/);
  expect(() => resolveGeneration({packageName: '../outside'})).toThrow(/package name/);
  expect(() => resolveGeneration({header: '{{constructor.constructor}}'})).toThrow(/Header/);
  expect(() => resolveGeneration({logger: 'unconfigured'})).toThrow(/logger/);
  const profile = generationProfiles[0];
  const code = generate(model, 'browser', {...profile, options: {...profile.options, header: '{{class}}\nraise RuntimeError()'}});
  expect(code).toContain('# Checkout\n# raise RuntimeError()');
  const css = structuredClone(model);
  css.elements[0].candidates[0].locator = {strategy: 'css', selector: '#email'};
  expect(generate({...css, generation: {selectorConstants: true}})).toContain('page.locator(self.CSS_EMAIL)');
});

it('produces identical package bytes and stable manifest paths', async () => {
  const profile = generationProfiles[5];
  const files = generatePackage(model, 'browser', profile);
  const first = await pythonPackageZip(files).arrayBuffer();
  const second = await pythonPackageZip(generatePackage(model, 'browser', profile)).arrayBuffer();
  expect(first).toEqual(second);
  expect(generationManifest(model, 'browser', profile, Object.keys(files)).files).toContain('automation/pages/checkout.py');
  expect(await artifactHashes(files)).toEqual(await artifactHashes(generatePackage(model, 'browser', profile)));
});

it('renders explicit steps and validates page-level overrides', () => {
  const copy: PageModel = {...model, generation: {interactions: false, timeoutMs: 900, methods: [
    {name: 'enter_email', steps: [{elementId: 'field', action: 'fill', argument: 'address', defaultValue: 'synthetic@example.test'}]},
  ]}};
  const code = generate(copy, 'browser', generationProfiles[2]);
  expect(code).toContain('async def enter_email(self, *, address: str = "synthetic@example.test")');
  expect(code).toContain('await self.email.fill(address, timeout=900)');
  expect(code).not.toContain('def fill_email');
  expect(() => generate({...copy, elements: []})).toThrow(/selected target/);
});

it('measures generation with 1,000 selected fields', () => {
  const copy: PageModel = {...model, elements: Array.from({length: 1000}, (_, index) =>
    ({...model.elements[0], id: 'field-' + index, name: 'field_' + index}))};
  const start = performance.now();
  const files = generatePackage(copy, 'browser', generationProfiles[3]);
  const bytes = new TextEncoder().encode(Object.values(files).join('')).length;
  console.info(`Generation workload 1000 fields: ${(performance.now() - start).toFixed(1)} ms, ${bytes} bytes`);
  expect(files['generated/pages/checkout.py']).toContain('def field_999');
});
