# Playwright Page Object Generator

Version 0.1.0 — local-only Chromium extension prototype.

## Build and install (Windows PowerShell or other shell)

Requires Node.js 22+ and npm. From this directory:

```sh
npm install
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

## Architecture

- `src/background`: opens the side panel on toolbar action.
- `src/content`: scans visible controls, ranks CSS/test-ID candidates, and highlights elements. Runs in the isolated extension world.
- `src/core/model.ts`: typed intermediate representation.
- `src/core/python.ts`: deterministic Python generation and identifier collision handling.
- `src/sidepanel`: React selection, naming, preview and export UI.
- `tests`: generator unit tests; `fixtures`: manual browser fixture.

## Limitations and verification

This initial version uses DOM CSS match counts, not Playwright runtime validation. The default test ID attribute is assumed. Structural CSS fallbacks are fragile. Semantic role/label locators, click-to-pick, iframe/shadow DOM discovery, component grouping, navigation helpers, interaction recording, async Python and importing models are future work. Rescan after DOM changes. Generated code requires review, especially for custom controls and file inputs. No input values, cookies or tokens are intentionally collected; labels and locator attributes can still contain sensitive application information, so review exports. No network transmission is implemented. Dependencies could not be downloaded in the creation environment, so the full build, Vitest suite and browser integration have not been executed there.

## Development

`npm run dev` watches bundled source files; rerun the build after changing static assets. Reload the extension in the browser after changes. Before release, add actual Playwright locator validation and browser integration tests, semantic locator generation, and dependency lockfile (`npm install` generates one).
