# Playwright Page Object Generator

Generate synchronous Python Playwright page objects from the active tab in Chrome or Edge. Page scanning and code generation run locally.

## Build and install (Windows PowerShell or other shell)

Requires Node.js 22+ and npm. From this directory:

```sh
npm ci
npm test
npm run build
```

If Windows PowerShell blocks `npm.ps1`, use `npm.cmd` in each command, for example `npm.cmd run build`.

Open `chrome://extensions` (or `edge://extensions`), enable Developer mode, select Load unpacked and choose the generated `dist` directory. Pin the extension. Open a web page, click the toolbar icon to grant temporary active-tab access, then click Scan active page in the side panel. If the panel offers Allow access to this site, click it and approve the browser prompt to scan the site. The browser remembers that site permission. For local files, enable Allow access to file URLs in the extension details or serve the files over localhost.

## Try the fixture

```sh
python -m http.server 8000
```

Open http://localhost:8000/fixtures/login.html. Scan, select controls, rename attributes, choose locators, highlight controls and export Python or JSON. Install Playwright in your Python test environment (`pip install pytest-playwright`, then `playwright install`). Import the exported class into a test and construct it with the pytest `page` fixture.

## Choose a locator

Each element starts with the highest-ranked locator that matches only that element in the browser scan. Choose another candidate to override it. Expand **Locator details** to see scoring explanations and warnings. Choose **Automatic** to restore the recommendation. Selected alternatives are reflected in Python and stored by candidate ID in JSON exports.

**Locator settings** saves an ordered list of recognized test ID attributes on this browser. Keep the Playwright test ID attribute at `data-testid` unless your Playwright project configures a different one. Other recognized attributes produce CSS selectors. Scan again to apply settings changes.

Match counts come from CSS queries or browser-side approximations of semantic locators. Confirm exported locators in Playwright and rescan after DOM changes. Labels and attributes can contain application information, so review exports before sharing them.

## Inspect elements on the page

Open the side panel and choose **Start inspection**. Hover a control, then click to add it without performing the application action. Use **Exact element** mode to pick the DOM node under the pointer, including static assertion targets. **Parent**, **Inspect child**, the sibling buttons, and **Original target** let you review nearby elements. Choose **Add target** to add the element shown in the panel.

With focus on the page, press **Enter** to add the current target or **Escape** to stop. Enter leaves editable controls alone. Escape also works in the side panel. The collection lets you rename, reorder, deselect, remove, highlight, and inspect rows. Scans and picks of the same live element share a row. Static targets generate a locator attribute for assertions. A detached row needs to be removed or deselected before generating Python.

Try [the specialty plan fixture](fixtures/inspector.html) over localhost. The three **See plans** buttons share an accessible name. The inspector exposes the ambiguous role locator and the unique test ID alternatives.

## Development

`npm run dev` watches bundled source files. Rebuild after changing static assets and reload the extension.

## Optional Playwright runtime validation

Pair the side panel with a local Python companion to validate locators in an explicitly connected Chromium profile. The panel reports uniqueness, intended-target identity, state, and optional trial actions separately. [Companion installation and Windows walkthrough](companion/README.md)

To run the integration suite, install the companion's test dependencies, Chromium, and its matching Headless Shell, then build the unpacked extension.

```sh
python -m pip install -c companion/constraints.txt -e './companion[dev]'
npx playwright install chromium
npm run build
python -m pytest companion -q
npm run test:browser
```

On Windows, `py` and `npx.cmd` can substitute for `python` and `npx`. Set `POM_PYTHON` to the Python executable if using a virtual environment. On Linux, add `--with-deps` to the Chromium install command if browser system dependencies are missing.

- [Architecture and validation](docs/architecture.md)
- [Current implementation and verification](docs/current-state.md)
- [Acceptance checklist](docs/acceptance-criteria.md)
- [Roadmap](docs/roadmap.md)
- [Changelog](CHANGELOG.md)
