import {spawn, spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer, type Server} from 'node:http';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, type BrowserContext, type Page} from 'playwright';
import {afterAll, beforeAll, beforeEach, expect, it} from 'vitest';
import type {PageModel} from '../../src/core/model';
import {defaultSettings} from '../../src/core/locator';

let context: BrowserContext;
let server: Server;
let temp: string;
let app: Page;
let panel: Page;
let extensionUrl: string;
let fixtureUrl: string;
let debugPort: number;
const panelButton = (name: string) => panel.getByRole('button', {name, exact: true});
const clickPanel = (name: string) => panelButton(name).evaluate((element: HTMLButtonElement) => element.click());
const section = () => panel.getByRole('region', {name: 'Element inspector'});
const target = () => section().locator('article strong');
const field = () => panel.getByRole('textbox', {name: 'Python element name'});
const python = process.env.POM_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3');

async function freePort() {
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, '127.0.0.1', done));
  const address = listener.address();
  await new Promise<void>((done, reject) => listener.close(error => error ? reject(error) : done()));
  if (!address || typeof address === 'string') throw Error('No loopback port');
  return address.port;
}

beforeAll(async () => {
  const fixture = await readFile(new URL('../../fixtures/inspector.html', import.meta.url));
  const login = await readFile(new URL('../../fixtures/login.html', import.meta.url));
  const components = await readFile(new URL('../../fixtures/components.html', import.meta.url));
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(request.url === '/login' ? login : request.url?.startsWith('/components') ? components : fixture);
  });
  await new Promise<void>(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Fixture did not bind to a TCP port');
  fixtureUrl = `http://127.0.0.1:${address.port}`;
  temp = await mkdtemp(join(tmpdir(), 'pom-inspector-'));
  const extension = join(temp, 'extension');
  await cp(resolve('dist'), extension, {recursive: true});
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // The extension is loaded normally. Pregrant only the loopback fixture host
  // because browser permission prompts are outside Playwright's page APIs.
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  debugPort = await freePort();
  context = await chromium.launchPersistentContext(join(temp, 'profile'), {
    channel: 'chromium', headless: true, viewport: {width: 1050, height: 760},
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      `--remote-debugging-port=${debugPort}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionUrl = worker.url().replace(/\/background\.js$/, '/sidepanel.html');
});

beforeEach(async () => {
  const old = context.pages();
  app = await context.newPage();
  app.setDefaultTimeout(4000);
  panel = await context.newPage();
  for (const page of old) await page.close();
  panel.setDefaultTimeout(4000);
  await app.goto(fixtureUrl);
  await panel.goto(extensionUrl);
  await app.bringToFront();
  await panelButton('Start inspection').waitFor();
  await expect.poll(() => panelButton('Start inspection').isEnabled()).toBe(true);
});

afterAll(async () => {
  await context?.close();
  server?.close();
  if (temp && dirname(resolve(temp)) === resolve(tmpdir())) await rm(temp, {recursive: true, force: true});
});

async function start() {
  await clickPanel('Start inspection');
  await expect.poll(() => section().getByRole('status').textContent()).toContain('Inspector active');
}

async function download(name: string) {
  const event = panel.waitForEvent('download');
  await clickPanel(name);
  const file = await (await event).path();
  if (!file) throw Error('No exported file');
  return readFile(file, 'utf8');
}

it('inspects repeated plans in the actual extension and preserves edits across duplicate picks', async () => {
  await start();
  const dental = app.getByTestId('dental-plans');
  await dental.locator('svg').hover();
  await expect.poll(() => target().textContent()).toContain('button · button · See plans');
  expect(await app.locator('[data-pom-overlay]').count()).toBe(1);
  expect(await dental.locator('span').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return document.elementFromPoint(rect.left + 3, rect.top + 3) === node;
  })).toBe(true);
  await section().getByText('Target locators', {exact: true}).click();
  expect(await section().getByText(/Role and accessible name.*Ambiguous/).count()).toBeGreaterThan(0);
  if (process.env.POM_INSPECTOR_SCREENSHOTS) {
    const output = process.env.POM_INSPECTOR_SCREENSHOTS;
    await mkdir(output, {recursive: true});
    await app.screenshot({path: join(output, 'inspector-page.png')});
    await panel.screenshot({path: join(output, 'inspector-panel.png')});
  }
  await clickPanel('Parent');
  await expect.poll(() => target().textContent()).toContain('article');
  await clickPanel('Add target');
  await expect.poll(() => field().count()).toBe(1);
  await clickPanel('Original target');
  await expect.poll(() => target().textContent()).toContain('See plans');
  await dental.locator('span').click();
  await expect.poll(() => field().count()).toBe(2);
  expect(await app.locator('#actions').textContent()).toBe('0');
  await field().nth(1).fill('dental_button');
  const row = panel.locator('article').filter({has: field()}).nth(1);
  const picker = row.getByLabel('Locator', {exact: true});
  const validCss = await picker.locator('option').allTextContents();
  const ambiguous = validCss.findIndex(label => label.includes(' · role · ') && label.includes('Ambiguous'));
  expect(ambiguous).toBeGreaterThan(-1);
  await picker.selectOption({index: ambiguous});
  expect(await panel.getByText('Choose a locator that uniquely matches dental_button').count()).toBe(1);
  const index = validCss.findIndex(label => label.includes(' · css · ') && label.includes('Unique target'));
  expect(index).toBeGreaterThan(-1);
  await picker.selectOption({index});
  const override = await picker.inputValue();
  await dental.locator('span').click();
  await expect.poll(() => panel.getByText('Element already in collection.').count()).toBe(1);
  expect(await field().count()).toBe(2);
  expect(await field().nth(1).inputValue()).toBe('dental_button');
  expect(await picker.inputValue()).toBe(override);
  await app.getByTestId('vision-plans').locator('span').click();
  await expect.poll(() => field().count()).toBe(3);
  await app.keyboard.press('Escape');
  await expect.poll(() => section().getByRole('status').textContent()).toContain('Escape');
  expect(await app.locator('[data-pom-overlay]').count()).toBe(0);
  await dental.click();
  expect(Number(await app.locator('#actions').textContent())).toBeGreaterThan(0);
  const exported: PageModel = JSON.parse(await download('Export JSON'));
  expect(exported.elements.map(element => element.action)).toEqual(['assert', 'click', 'click']);
  expect(exported.elements[1].choice).toBe(override);
  const code = await download('Export Python');
  expect(code).toContain('def click_dental_button');
  expect(code).not.toContain('def assert_');
  const parsed = spawnSync(python, ['-c', 'import ast, sys; ast.parse(sys.stdin.buffer.read().decode("utf-8"))'],
    {input: code, encoding: 'utf8'});
  expect(parsed.status, parsed.stderr || parsed.error?.message).toBe(0);
  for (const element of exported.elements) {
    const selected = element.choice ? element.candidates.find(candidate => candidate.id === element.choice) : element.candidates[0];
    const locator = selected!.locator;
    const match = locator.strategy === 'test-id' ? app.getByTestId(locator.value) :
      locator.strategy === 'css' ? app.locator(locator.selector) : null;
    expect(await match?.count()).toBe(1);
  }
}, 25_000);

it('handles exact and semantic targets, hierarchy, live replacement and panel closure', async () => {
  await app.locator('#account').fill('fixture-sensitive-password');
  await start();
  await app.locator('label span').hover();
  await expect.poll(() => target().textContent()).toContain('input');
  await clickPanel('Add target');
  await expect.poll(() => field().count()).toBe(1);
  expect(await download('Export JSON')).not.toContain('fixture-sensitive');
  await clickPanel('Remove all elements');
  await app.locator('#image-link img').hover();
  await expect.poll(() => target().textContent()).toContain('a · link');
  await section().locator('select').first().selectOption('exact');
  await expect.poll(() => target().textContent()).toContain('img · img');
  await app.getByTestId('dental-plans').locator('svg').hover({position: {x: 2, y: 2}});
  await expect.poll(() => target().textContent()).toContain('svg');
  await clickPanel('Next sibling');
  await expect.poll(() => target().textContent()).toContain('span');
  await clickPanel('Previous sibling');
  await expect.poll(() => target().textContent()).toContain('svg');
  await clickPanel('Parent');
  await expect.poll(() => target().textContent()).toContain('button');
  await clickPanel('Inspect child');
  await expect.poll(() => target().textContent()).toContain('svg');
  await app.evaluate(() => {
    const node = document.createElement('button');
    node.id = 'dynamic-pick';
    node.textContent = 'Dynamic';
    document.querySelector('#dynamic')!.append(node);
  });
  const dynamic = app.locator('#dynamic-pick');
  await dynamic.evaluate((node: HTMLButtonElement) => node.click());
  expect(await field().count()).toBe(0);
  await app.locator('#account').blur();
  await dynamic.hover();
  await expect.poll(() => target().textContent()).toContain('Dynamic');
  await app.keyboard.press('Enter');
  await expect.poll(() => field().count()).toBe(1);
  const old = JSON.parse(await download('Export JSON')) as PageModel;
  await dynamic.evaluate(node => node.replaceWith(node.cloneNode(true)));
  await expect.poll(() => panel.getByText('Detached element.', {exact: false}).count()).toBe(1);
  await dynamic.click();
  await expect.poll(() => field().count()).toBe(2);
  const next = JSON.parse(await download('Export JSON')) as PageModel;
  expect(next.elements[0].stale).toBe(true);
  expect(next.elements[1].id).not.toBe(old.elements[0].id);
  expect(JSON.stringify(next)).not.toContain('fixture-sensitive');
  await panel.close();
  await expect.poll(() => app.locator('[data-pom-overlay]').count()).toBe(0);
  await app.getByTestId('dental-plans').click();
  expect(Number(await app.locator('#actions').textContent())).toBeGreaterThan(0);
}, 25_000);

it('keeps scan and picks in one collection and stops after tab change or reload', async () => {
  await app.goto(fixtureUrl + '/login');
  await clickPanel('Scan active page');
  await expect.poll(() => field().count()).toBe(5);
  await field().first().fill('custom_email');
  await start();
  await app.getByTestId('email').click();
  await expect.poll(() => panel.getByText('Element already in collection.').count()).toBe(1);
  expect(await field().count()).toBe(5);
  expect(await field().first().inputValue()).toBe('custom_email');
  const another = await context.newPage();
  await another.goto(fixtureUrl);
  await another.bringToFront();
  await expect.poll(() => section().getByRole('status').textContent()).toMatch(/switching|disconnected/i);
  await expect.poll(() => app.locator('[data-pom-overlay]').count()).toBe(0);
  await app.bringToFront();
  await start();
  await app.reload();
  await expect.poll(() => panelButton('Start inspection').count()).toBe(1);
  expect(await app.locator('[data-pom-overlay]').count()).toBe(0);
}, 25_000);

it('keeps isolated overlay bounds aligned after scrolling and resizing', async () => {
  await start();
  const row = app.locator('#coverage-row');
  await row.hover();
  const cdp = await context.newCDPSession(app);
  type Tree = {nodeId: number; attributes?: string[]; children?: Tree[]; shadowRoots?: Tree[]};
  function hoverBox(node: Tree): Tree | undefined {
    const index = node.attributes?.indexOf('data-pom-state') ?? -1;
    if (index >= 0 && node.attributes?.[index + 1] === 'hover') return node;
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      const found = hoverBox(child);
      if (found) return found;
    }
  }
  async function boundsMatch() {
    const {root} = await cdp.send('DOM.getDocument', {depth: -1, pierce: true});
    const node = hoverBox(root);
    if (!node) return false;
    const {object} = await cdp.send('DOM.resolveNode', {nodeId: node.nodeId, objectGroup: 'overlay-check'});
    const {result} = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId, returnByValue: true,
      functionDeclaration: 'function() { const r = this.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; }',
    });
    await cdp.send('Runtime.releaseObjectGroup', {objectGroup: 'overlay-check'});
    const rect = await row.boundingBox();
    return rect && [rect.x, rect.y, rect.width, rect.height]
      .every((number, index) => Math.abs(number - result.value[index]) < 1);
  }
  try {
    await expect.poll(boundsMatch).toBe(true);
    await row.evaluate(node => {
      node.querySelector('td')!.style.minWidth = '220px';
      node.closest('.scroll')!.scrollTop += 8;
    });
    await app.setViewportSize({width: 1000, height: 740});
    await expect.poll(boundsMatch).toBe(true);
    await app.locator('dialog').evaluate((dialog: HTMLDialogElement) => dialog.showModal());
    await app.getByText('Options', {exact: true}).hover();
    await expect.poll(() => target().textContent()).toBe('p');
    expect(await app.locator('dialog [data-pom-overlay]').count()).toBe(1);
  } finally {
    await cdp.detach();
  }
}, 20_000);

it('coalesces hover work on a 2,500-control DOM and reports measured timing', async () => {
  await app.goto(fixtureUrl + '/?large=1');
  expect(await app.locator('[id^=perf-]').count()).toBe(2500);
  await start();
  const boxes = await app.locator('[id^=perf-]').evaluateAll(nodes => nodes.slice(0, 25).map(node => {
    const rect = node.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  }));
  const cdp = await context.newCDPSession(app);
  const samples: number[] = [];
  for (let batch = 0; batch < 20; batch++) {
    const start = performance.now();
    await Promise.all(boxes.map(box => cdp.send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...box})));
    samples.push(performance.now() - start);
  }
  await cdp.detach();
  samples.sort((a, b) => a - b);
  const started = performance.now();
  await app.locator('#perf-49').hover();
  await expect.poll(() => target().textContent()).toContain('Fixture control 49');
  const settle = performance.now() - started;
  console.info(`Inspector 2,500-control fixture, 500 CDP moves in 20 batches: median batch ${samples[10].toFixed(1)} ms, p95 ${samples[18].toFixed(1)} ms, settled panel update ${settle.toFixed(0)} ms.`);
  expect(await app.locator('[data-pom-overlay]').count()).toBe(1);
  await clickPanel('Stop inspection');
  await expect.poll(() => app.locator('[data-pom-overlay]').count()).toBe(0);
}, 25_000);

it('rejects invalid commands and makes repeated starts idempotent on one document port', async () => {
  await start();
  await clickPanel('Stop inspection');
  // Open a direct same-extension port to exercise the wire contract in Chromium.
  const states = await panel.evaluate(async settings => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const port = chrome.tabs.connect(tab.id!, {name: 'pom-inspector', frameId: 0});
    return new Promise<string[]>(resolveStates => {
      const output: string[] = [];
      port.onMessage.addListener(event => {
        output.push(event.type);
        if (event.type === 'stopped') {
          port.disconnect();
          resolveStates(output);
        }
      });
      port.postMessage({type: 'start', settings, mode: 'semantic'});
      port.postMessage({type: 'start', settings, mode: 'semantic'});
      port.postMessage({type: 'inspect', id: 'old-document:1'});
      port.postMessage({type: 'navigate', direction: 'invalid'});
      port.postMessage({type: 'stop'});
    });
  }, defaultSettings);
  expect(states).toEqual(['active', 'stale', 'error', 'stopped']);
}, 15_000);

it('discovers, scopes and exports reusable components from the unpacked extension', async () => {
  await app.goto(fixtureUrl + '/components');
  await clickPanel('Scan active page');
  await expect.poll(() => field().count(), {timeout: 10_000}).toBeGreaterThan(3);
  await app.evaluate(() => {
    const wrapper = document.createElement('section');
    for (let i = 0; i < 650; i++) {
      const item = document.createElement('div');
      item.className = 'fixture-row';
      const button = document.createElement('button');
      button.textContent = 'Fixture ' + i;
      item.append(button);
      wrapper.append(item);
    }
    document.body.append(wrapper);
  });
  await panel.getByText('Reusable components (0)', {exact: true}).click();
  const started = performance.now();
  await clickPanel('Discover components');
  const suggestion = panel.locator('article').filter({hasText: 'Dental, Vision, Life'});
  await expect.poll(() => suggestion.count(), {timeout: 10_000}).toBe(1);
  console.info(`Component discovery on the 650-extra-boundary fixture reached the side panel in ${Math.round(performance.now() - started)} ms.`);
  expect(await suggestion.getByText(/3 instances/).count()).toBe(1);
  await suggestion.getByRole('button', {name: 'Accept component'}).click();
  await panel.getByText('Article component · definition', {exact: true}).click();
  await panel.getByLabel('Component Python class').fill('SpecialtyPlanCard');
  await panel.getByLabel('Python class', {exact: true}).fill('PlansPage');
  await clickPanel('Move matching page elements into component');
  await app.bringToFront();
  await start();
  for (const id of ['dental-card', 'vision-card', 'life-card']) {
    await app.getByTestId(id).locator('.status').click({position: {x: 1, y: 1}});
  }
  await clickPanel('Stop inspection');
  const snapshot: PageModel = JSON.parse(await download('Export JSON'));
  const statusRows = snapshot.elements.filter(element => element.tag === 'div' && element.label === 'Available');
  expect(statusRows).toHaveLength(3);
  const selectRoot = panel.getByLabel('Component root', {exact: true});
  await selectRoot.selectOption(statusRows[0].id);
  await clickPanel('Define component root');
  const childSummary = panel.getByText('Div component · definition', {exact: true});
  await childSummary.click();
  const childDefinition = childSummary.locator('..');
  await childDefinition.getByLabel('Component Python class').fill('StatusBadge');
  await childDefinition.getByLabel('Expose instances on page').uncheck();
  for (const [index, row] of statusRows.slice(1).entries()) {
    await selectRoot.selectOption(row.id);
    await childDefinition.getByRole('button', {name: 'Add selected root as instance'}).click();
    await expect.poll(() => childDefinition.getByText(`Instances (${index + 2})`, {exact: true}).count()).toBe(1);
  }
  const parentDefinition = panel.getByText('Article component · definition', {exact: true}).locator('..');
  await parentDefinition.getByText('Nested components (0)', {exact: true}).click();
  await parentDefinition.getByLabel('Nested definition', {exact: true}).selectOption({label: 'Div component'});
  await parentDefinition.getByRole('button', {name: 'Add nested instance'}).click();
  await expect.poll(() => parentDefinition.getByText('Nested components (1)', {exact: true}).count()).toBe(1);
  await clickPanel('Clear all');
  expect(await panel.locator('textarea').inputValue()).toContain('root.get_by_role("button", name="See plans", exact=True)');
  const output = panel.waitForEvent('download');
  await clickPanel('Export Python package');
  const archive = await (await output).path();
  if (!archive) throw Error('Missing generated archive.');
  const result = spawnSync(python, [
    fileURLToPath(new URL('./run_component_package.py', import.meta.url)), archive,
    fileURLToPath(new URL('../../fixtures/components.html', import.meta.url)),
  ], {encoding: 'utf8'});
  expect(result.status, result.stderr || result.error?.message).toBe(0);
  const exported: PageModel = JSON.parse(await download('Export JSON'));
  expect(exported.schemaVersion).toBe(2);
  expect(exported.components?.[0].instances).toHaveLength(3);
  expect(exported.components?.[0].children).toHaveLength(1);
}, 65_000);

it('shows actionable guidance for unsupported browser pages', async () => {
  await app.goto('about:blank');
  await app.bringToFront();
  await clickPanel('Start inspection');
  await expect.poll(() => panel.getByText(/Open an HTTP or HTTPS page/).count()).toBe(1);
});

it('pairs the actual extension with Python and validates selected locator evidence over CDP', async () => {
  const port = await freePort();
  const token = randomBytes(32).toString('base64url');
  const extensionId = new URL(extensionUrl).hostname;
  const service = spawn(python, ['-m', 'pom_validator.cli', 'serve', '--port', String(port),
    '--debug-port', String(debugPort), '--extension-id', extensionId], {
    env: {...process.env, POM_VALIDATOR_TOKEN: token}, stdio: ['ignore', 'ignore', 'pipe'],
  });
  const exited = new Promise<void>(resolve => service.once('close', () => resolve()));
  let serviceLog = '';
  service.stderr.on('data', (data: Buffer) => {serviceLog += data.toString();});
  try {
    await expect.poll(() => serviceLog, {timeout: 7000}).toContain('service_ready');
    await panel.getByText('Playwright runtime validation', {exact: true}).click();
    await panel.getByLabel('Companion loopback port').fill(String(port));
    await panel.getByLabel('Pairing token').fill(token);
    await panelButton('Pair with companion').click();
    await expect.poll(() => panel.getByText(/Companion paired/).count(), {timeout: 7000}).toBe(1);
    await clickPanel('Connect browser');
    await expect.poll(() => panel.getByText(/Browser connected/).count(), {timeout: 7000}).toBe(1);
    await app.bringToFront();
    await start();
    await app.getByTestId('dental-plans').click();
    await expect.poll(() => field().count()).toBe(1);
    await app.getByTestId('vision-plans').click();
    await expect.poll(() => field().count()).toBe(2);
    await clickPanel('Stop inspection');
    const row = panel.locator('article').filter({has: field()}).first();
    const picker = row.getByLabel('Locator', {exact: true});
    await row.getByRole('button', {name: 'Validate current locator'}).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => row.getByText(/Current · unique-target · 1 matches/).count(), {timeout: 7000}).toBe(1);
    await row.getByRole('button', {name: 'Validate all candidates'}).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => picker.locator('option').allTextContents()).toEqual(expect.arrayContaining([
      expect.stringContaining('Playwright: ambiguous'),
    ]));
    const labels = await picker.locator('option').allTextContents();
    await picker.selectOption({index: labels.findIndex(label => label.includes(' · role · '))});
    expect(await row.getByText(/Current · ambiguous · 3 matches · identity confirmed/).count()).toBe(1);
    expect(await panel.getByText(/Playwright found ambiguous/).count()).toBe(1);
    if (process.env.POM_INSPECTOR_SCREENSHOTS) {
      const output = process.env.POM_INSPECTOR_SCREENSHOTS;
      await mkdir(output, {recursive: true});
      await row.screenshot({path: join(output, 'runtime-validation.png')});
    }
    await picker.selectOption('');
    await clickPanel('Validate selected elements');
    await expect.poll(() => panel.getByText(/Validated 2 element/).count()).toBe(1);
    expect(await panel.locator('textarea').inputValue()).toContain('page.get_by_test_id');
    const exported = await download('Export JSON');
    expect(exported).toContain('"method": "playwright"');
    expect(exported).not.toContain(token);
    const markers = await app.evaluate(() => [...document.querySelectorAll('*')].some(node =>
      node.getAttributeNames().some(name => name.startsWith('data-pom-validation-'))));
    expect(markers).toBe(false);
    const snapshot: PageModel = JSON.parse(exported);
    const lease = await panel.evaluate(async ({documentKey, referenceId}) => {
      const [active] = await chrome.tabs.query({active: true, currentWindow: true});
      const marker = await chrome.tabs.sendMessage(active.id!, {type: 'POM_RUNTIME_MARK', documentKey, referenceId});
      return {tab: active.id!, attribute: marker.attribute};
    }, {documentKey: snapshot.documentKey, referenceId: snapshot.elements[0].referenceId});
    await app.locator('#dental-trigger').evaluate(node => node.replaceWith(node.cloneNode(true)));
    expect(await panel.evaluate(lease => chrome.tabs.sendMessage(lease.tab, {
      type: 'POM_RUNTIME_RELEASE', attribute: lease.attribute,
    }), lease)).toBe(false);
    expect(await app.locator(`[${lease.attribute}-target]`).count()).toBe(0);
    await expect.poll(() => row.getByText(/Historical · unique-target/).count()).toBe(1);
    await clickPanel('Disconnect browser');
    await expect.poll(() => panel.getByText(/Companion paired/).count()).toBe(1);
    await clickPanel('Scan active page');
    await expect.poll(() => field().count()).toBeGreaterThan(1);
    expect(await app.getByTestId('dental-plans').count()).toBe(1);
    await app.goto(fixtureUrl + '/components');
    await clickPanel('Scan active page');
    await expect.poll(() => field().count()).toBeGreaterThan(3);
    await clickPanel('Connect browser');
    await expect.poll(() => panel.getByText(/Browser connected/).count()).toBe(1);
    await panel.getByText('Reusable components (0)', {exact: true}).click();
    await clickPanel('Discover components');
    const component = panel.locator('article').filter({hasText: 'Dental, Vision, Life'});
    await component.getByRole('button', {name: 'Accept component'}).click();
    await panel.getByText('Article component · definition', {exact: true}).click();
    await clickPanel('Validate component with Playwright');
    await panel.getByText('Playwright component evidence', {exact: true}).click({timeout: 12_000});
    await expect.poll(() => panel.getByText(/see_plans_button.*unique-target.*root 1, confirmed/).count(),
      {timeout: 12_000}).toBe(3);
    if (process.env.POM_INSPECTOR_SCREENSHOTS) {
      await panel.screenshot({path: join(process.env.POM_INSPECTOR_SCREENSHOTS, 'components-runtime.png')});
    }
  } finally {
    service.kill();
    await exited;
  }
}, 60_000);

it('releases page listeners and overlay when the extension reloads', async () => {
  await start();
  const dental = app.getByTestId('dental-plans');
  await dental.hover();
  await expect.poll(() => app.locator('[data-pom-overlay]').count()).toBe(1);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 0); });
  await expect.poll(() => app.locator('[data-pom-overlay]').count()).toBe(0);
  await dental.click();
  expect(Number(await app.locator('#actions').textContent())).toBeGreaterThan(0);
}, 15_000);
