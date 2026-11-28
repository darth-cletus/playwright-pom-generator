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

If the panel reports that extension APIs are unavailable, rebuild, reload the unpacked extension, and reopen the panel from the toolbar. Opening `dist/sidepanel.html` through localhost or as a file runs it outside the extension context.

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

## Build reusable components

Scan the page or pick a container in the inspector. Open **Reusable components** and choose **Discover components**, or select an inspected row and choose **Define component root**. Review sampled instances, scoped members, and optional absences before accepting. Names and locator choices can be edited in the definition, and matching page rows can be moved into it.

The **Python preview** supports single-file and package output. **Export Python package** downloads generated pages, component modules, and initialization files as a ZIP. The JSON model records accepted definitions and relationships. Try Dental, Vision, and Life in `fixtures/components.html`. [Component architecture and limits](docs/architecture.md)

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
## Live discovery

Open the extension on the intended tab and select **Enable live discovery**. The panel displays the current path and observed state. Newly found controls are unselected. Selected controls keep their names, actions, and manual locator choices when the DOM changes. A missing control remains in the model with an availability message.

Use **Pause live discovery** while editing, **Resume live discovery** to reconcile the current page, or **Full rescan** if changes extend beyond the affected subtree. **Refresh selected elements** refreshes browser-side locator checks. With the optional companion paired, **Validate current locator** and **Validate selected elements** obtain fresh Playwright evidence.

When the companion is already connected, you can enable automatic validation for changed selected elements. The option starts disabled. Each automatic batch checks up to five locators without running actionability trials.

Open **Live discovery details** to inspect batch timing and rendered collection membership. A total is shown when the page supplies a usable `aria-rowcount`. Add an application state label before exporting a page model. Live JSON exports carry the state label, route and availability without the document's transient references. The Python companion remains compatible with protocol v1.

Use [the dynamic fixture](fixtures/dynamic.html) with the local fixture server for development. See the [lifecycle design](docs/decisions/0003-live-application-lifecycle.md) and [POM-006 verification](docs/pom-006-verification.md).

## Iframes and shadow DOM

**Scan active page** includes accessible same-origin frames and open shadow roots. Open **Browsing contexts** to filter the collection or scan one context. A cross-origin iframe needs explicit permission. Choose **Scan embedded frames from** its origin, grant access in the browser, and use **Inspect** beside that frame to pick controls from its document.

Python exports use native lazy locators, including `.content_frame` for iframe transitions. The v0.7.0 companion validates scoped paths over the existing protocol. See the [POM-007 verification report](docs/pom-007-verification.md) for the scope of support.
