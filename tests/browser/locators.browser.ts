import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium, selectors, type Browser, type Page, type Locator as PlaywrightLocator} from 'playwright';
import {afterAll, beforeAll, beforeEach, expect, it} from 'vitest';
import {defaultSettings, type Locator, type LocatorSettings} from '../../src/core/locator';
import {generate} from '../../src/core/python';
import type {PageModel} from '../../src/core/model';
import type * as helpers from './helpers';

declare global {
  interface Window {
    engine: typeof helpers;
    scanFixture: (settings: LocatorSettings) => PageModel;
    highlightFixture: (id: string) => {ok: boolean};
  }
}

let browser: Browser;
let page: Page;
let content: string;
let engine: string;
let panel: string;
const fixture = await readFile(new URL('../../fixtures/locators.html', import.meta.url), 'utf8');

beforeAll(async () => {
  async function bundle(path: string, globalName?: string) {
    const file = fileURLToPath(new URL(path, import.meta.url));
    const result = await build({entryPoints: [file], bundle: true, format: 'iife', write: false, globalName});
    return result.outputFiles[0].text;
  }
  [engine, content, panel] = await Promise.all([
    bundle('./helpers.ts', 'engine'), bundle('../../src/content/index.ts'), bundle('../../src/sidepanel/index.tsx'),
  ]);
  browser = await chromium.launch();
  page = await browser.newPage();
  page.setDefaultTimeout(2_000);
});

beforeEach(async () => {
  await page.goto('about:blank');
  await page.setContent(fixture);
  await page.addScriptTag({content: engine});
});

afterAll(async () => {
  await browser?.close();
});

async function candidates(id: string, settings = defaultSettings) {
  return page.evaluate(({id, settings}) => {
    const {createDomValidator, extractMetadata, generateCandidates} = window.engine;
    const target = document.getElementById(id)!;
    const text = new WeakMap<Element, string>();
    return generateCandidates(target, extractMetadata(target, text), settings, createDomValidator(document, text));
  }, {id, settings});
}

async function scan() {
  await page.evaluate(() => {
    Object.defineProperty(window, 'chrome', {value: {runtime: {onMessage: {
      addListener(listener: (message: object, sender: object, reply: (result: never) => void) => void) {
        window.scanFixture = settings => {
          let model!: PageModel;
          listener({type: 'POM_SCAN', settings}, {}, result => { model = result; });
          return model;
        };
        window.highlightFixture = id => {
          let highlight!: {ok: boolean};
          listener({type: 'POM_HIGHLIGHT', id}, {}, result => { highlight = result; });
          return highlight;
        };
      },
      removeListener() {},
    }, onConnect: {addListener() {}}}}});
  });
  await page.addScriptTag({content});
  return page.evaluate(settings => window.scanFixture(settings), defaultSettings);
}

function runtimeLocator(locator: Locator, scope: Page | PlaywrightLocator = page): PlaywrightLocator {
  const exact = {exact: true};
  switch (locator.strategy) {
    case 'css': return scope.locator(locator.selector);
    case 'test-id': return scope.getByTestId(locator.value);
    case 'role': return scope.getByRole(locator.role as Parameters<Page['getByRole']>[0], {...exact, name: locator.name});
    case 'label': return scope.getByLabel(locator.value, exact);
    case 'placeholder': return scope.getByPlaceholder(locator.value, exact);
    case 'text': return scope.getByText(locator.value, exact);
    case 'alt': return scope.getByAltText(locator.value, exact);
    case 'title': return scope.getByTitle(locator.value, exact);
    case 'chain': return runtimeLocator(locator.child, runtimeLocator(locator.root, scope));
    case 'filter': return runtimeLocator(locator.base, scope).filter(locator.has
      ? {has: runtimeLocator(locator.has)} : {hasText: locator.text});
    case 'index': return runtimeLocator(locator.base, scope).nth(locator.index);
  }
}

it('detects native, contextual and explicit roles', async () => {
  const expected = {
    aria: 'button', link: 'link', 'email-2': 'textbox', search: 'searchbox', check: 'checkbox',
    radio: 'radio', combo: 'combobox', region: 'combobox', regions: 'listbox', range: 'slider',
    quantity: 'spinbutton', switch: 'switch', tab: 'tab', menuitem: 'menuitem', logo: 'img',
    dialog: 'dialog', table: 'table', row: 'row', cell: 'cell', password: null, linkless: null,
    'datalist-input': 'combobox', 'missing-list': 'textbox',
  };
  const actual = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
    return [id, window.engine.accessibleRole(document.getElementById(id)!)];
  })), Object.keys(expected));
  expect(actual).toEqual(expected);
  expect(await page.evaluate(() => ['h1', 'option'].map(selector =>
    window.engine.accessibleRole(document.querySelector(selector)!)))).toEqual(['heading', 'option']);
});

it('computes accessible names from references, labels, alternate text and public button values', async () => {
  const expected = {
    refs: 'Delete project', aria: 'Save settings', phone: 'Telephone Work', logo: 'Company logo',
    submit: 'Apply changes', password: 'Passphrase', broken: 'Fallback name', 'label-value': '',
  };
  const actual = await page.evaluate(ids => Object.fromEntries(ids.map(id => [
    id, window.engine.accessibleName(document.getElementById(id)!),
  ])), Object.keys(expected));
  expect(actual).toEqual(expected);
});

it('finds explicit, wrapped, modified and ARIA-associated labels', async () => {
  const actual = await page.evaluate(() => {
    const cache = new WeakMap<Element, string>();
    const labels = (id: string) => window.engine.associatedLabels(document.getElementById(id)!, cache);
    document.querySelector('label[for="email-2"]')!.textContent = 'Changed email';
    return ['email-2', 'password', 'phone', 'aria', 'refs', 'broken', 'check'].map(labels);
  });
  expect(actual).toEqual([['Changed email'], ['Passphrase'], ['Telephone', 'Work'], ['Save settings'],
    ['Delete', 'project'], ['Fallback name'], ['Remember']]);
});

it('separates ambiguous, wrong-target, missing and invalid locators', async () => {
  const results = await page.evaluate(() => {
    const target = document.querySelector('[data-testid=repeat]')!;
    const validate = window.engine.createDomValidator(document);
    const css = (selector: string) => validate({strategy: 'css', selector}, target);
    return [css('[data-testid=repeat]'), css('#aria'), css('#missing'), css('['),
      validate({strategy: 'text', value: 'Edit'}, target)];
  });
  expect(results.map(result => result.status)).toEqual(['ambiguous', 'wrong-target', 'no-match', 'error', 'ambiguous']);
  expect(results.map(result => result.count)).toEqual([2, 1, 0, undefined, 2]);
  expect(results[0].matchesTarget).toBe(true);
  expect(results[1].matchesTarget).toBe(false);
  expect(results[4].method).toBe('semantic-approximation');
  expect(await page.getByText('Edit', {exact: true}).count()).toBe(2);
});

it('ranks custom test attributes and only emits native test ID for the configured attribute', async () => {
  const custom = await candidates('email-2', {testAttributes: ['data-cy', 'data-testid', 'data-testid'], playwrightTestAttribute: 'data-qa'});
  expect(custom[0].locator).toEqual({strategy: 'test-id', attribute: 'data-qa', value: 'email'});
  expect(custom.filter(candidate => candidate.locator.strategy === 'test-id')).toHaveLength(1);
  const alternative = custom.filter(candidate => candidate.basis === 'data-cy' || candidate.basis === 'data-testid');
  expect(alternative.map(candidate => candidate.basis)).toEqual(['data-cy', 'data-testid']);
  expect(alternative.every(candidate => candidate.locator.strategy === 'css')).toBe(true);
  expect(new Set(custom.map(candidate => candidate.id)).size).toBe(custom.length);
  selectors.setTestIdAttribute('data-qa');
  try {
    expect(await runtimeLocator(custom[0].locator).getAttribute('id')).toBe('email-2');
  } finally {
    selectors.setTestIdAttribute('data-testid');
  }
});

it('compares all native locator strategies and CSS with real Playwright', async () => {
  const examples = {
    'email-2': ['test-id', 'role', 'label', 'placeholder', 'css'],
    password: ['label', 'css'],
    refs: ['role', 'label', 'text'],
    unicode: ['test-id', 'title', 'text'],
    'image-button': ['alt'],
    logo: ['alt'],
  };
  for (const [id, strategies] of Object.entries(examples)) {
    const available = await candidates(id);
    for (const strategy of strategies) {
      const candidate = available.find(option => option.locator.strategy === strategy && option.validation.status === 'unique-target');
      expect(candidate, `${id}: ${strategy}`).toBeDefined();
      const locator = runtimeLocator(candidate!.locator);
      expect(await locator.count(), `${id}: ${strategy}`).toBe(1);
      expect(await locator.getAttribute('id'), `${id}: ${strategy}`).toBe(id);
    }
  }
});

it('scans and highlights controls without exporting live form values', async () => {
  await page.locator('#password').fill('private-password');
  const model = await scan();
  expect(model.elements.map(element => element.label)).not.toContain('Hidden button');
  expect(model.elements.map(element => element.label)).not.toContain('Welcome');
  const disabled = model.elements.find(element => element.label === 'Draft');
  expect(disabled?.candidates.some(candidate =>
    candidate.locator.strategy === 'title' && candidate.locator.value === 'Save draft')).toBe(true);
  expect(model.elements.map(element => element.label)).toContain('Choose a plan');
  expect(JSON.stringify(model)).not.toMatch(/private-password|sentinel-private/);
  const repeated = model.elements.filter(element => element.label === 'Edit');
  expect(repeated).toHaveLength(2);
  for (const [index, element] of repeated.entries()) {
    expect(element.candidates[0].basis).toBe('Structural fallback');
    expect(await runtimeLocator(element.candidates[0].locator).evaluate(node =>
      [...document.querySelectorAll('[data-testid=repeat]')].indexOf(node))).toBe(index);
  }
  expect(await page.evaluate(id => window.highlightFixture(id), repeated[0].referenceId!)).toEqual({ok: true});
});

it('scans the original login fixture and keeps its native interaction types', async () => {
  await page.setContent(await readFile(new URL('../../fixtures/login.html', import.meta.url), 'utf8'));
  const model = await scan();
  expect(model.elements.map(element => [element.label, element.action])).toEqual([
    ['Email', 'fill'], ['Password', 'fill'], ['Sign in', 'click'], ['Remember me', 'check'], ['region', 'select'],
  ]);
  expect(generate(model)).toContain('page.get_by_test_id("sign-in")');
});

const python = process.env.POM_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3');

it('parses generated Python with the Python AST', async () => {
  const model = await scan();
  const code = generate(model);
  const result = spawnSync(python, ['-c', 'import ast, sys; ast.parse(sys.stdin.buffer.read().decode("utf-8"))'],
    {input: code, encoding: 'utf8'});
  expect(result.error, result.error?.message).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});

it('executes generated test ID, label and structural locators in Python Playwright', async () => {
  const model = await scan();
  const wanted = ['Email address', 'Passphrase', 'Edit', 'Save settings'];
  model.elements = wanted.map(label => model.elements.find(element => element.label === label)!);
  const save = model.elements[3];
  save.choice = save.candidates.find(candidate => candidate.locator.strategy === 'role')!.id;
  const result = spawnSync(python, [
    fileURLToPath(new URL('./run_page_object.py', import.meta.url)),
    fileURLToPath(new URL('../../fixtures/locators.html', import.meta.url)),
  ], {input: generate(model), encoding: 'utf8'});
  expect(result.error, result.error?.message).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}, 20_000);

it('keeps a panel override after renaming or toggling selection and restores automatic', async () => {
  const model = await scan();
  const email = model.elements.find(element => element.label === 'Email address')!;
  const label = email.candidates.find(candidate => candidate.locator.strategy === 'label')!;
  await page.evaluate(model => {
    Object.assign(chrome, {
      storage: {local: {get: async () => ({}), set: async () => {}}},
      tabs: {
        query: async () => [{id: 1, url: 'https://example.test/fixture'}],
        sendMessage: async () => model,
      },
      scripting: {executeScript: async () => []},
    });
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
  }, {...model, elements: [email]});
  await page.addScriptTag({content: panel});
  const root = page.locator('#root');
  expect(await page.pageErrors()).toEqual([]);
  await root.getByRole('button', {name: 'Scan active page'}).click();
  await root.getByLabel('Locator', {exact: true}).selectOption(label.id);
  await root.getByLabel('Python element name').fill('Contact email');
  await root.getByRole('checkbox').uncheck();
  await root.getByRole('checkbox').check();
  expect(await root.locator('textarea').inputValue()).toContain('self.contact_email = page.get_by_label');
  await root.getByLabel('Locator', {exact: true}).selectOption('');
  expect(await root.locator('textarea').inputValue()).toContain('self.contact_email = page.get_by_test_id');
});

it('measures repeated cards and table rows while retaining the representative root limit', async () => {
  const samples = await page.evaluate(settings => {
    const {discoverComponents, ElementCollection} = window.engine;
    const measurements = [];
    for (const [kind, size] of [['cards', 3], ['cards', 20], ['cards', 100], ['table', 120]] as const) {
      if (kind === 'cards') {
        document.body.innerHTML = '<section>' + Array.from({length: size}, (_, index) =>
          `<article data-slot="plan" data-testid="plan-${index}"><h2>Plan ${index}</h2><p>Coverage</p><button>See plans</button></article>`
        ).join('') + '</section>';
      } else {
        document.body.innerHTML = '<table><tbody>' + Array.from({length: size}, (_, index) =>
          `<tr data-testid="row-${index}"><td>Plan ${index}</td><td><button>Details</button></td></tr>`
        ).join('') + '</tbody></table>';
      }
      let counts = {boundaries: 0, candidateRoots: 0, comparisons: 0, groups: 0};
      const started = performance.now();
      const actual = discoverComponents(new ElementCollection(), settings, value => {counts = value;});
      measurements.push({kind, size, ...counts, samples: actual[0]?.instances.length ?? 0,
        collectionCount: actual[0]?.collection?.count,
        milliseconds: Number((performance.now() - started).toFixed(1))});
    }
    return measurements;
  }, defaultSettings);
  console.info('Component structure benchmark', JSON.stringify(samples));
  expect(samples.map(sample => sample.samples)).toEqual([3, 20, 30, 30]);
  expect(samples.map(sample => sample.groups)).toEqual([1, 1, 1, 1]);
  expect(samples.map(sample => sample.collectionCount)).toEqual([3, 20, 100, 120]);
  expect(samples.map(sample => sample.comparisons)).toEqual([2, 19, 99, 119]);
}, 15_000);
