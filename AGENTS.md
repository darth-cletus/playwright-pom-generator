# Repository guidance

Playwright Page Object Generator is a local Chromium Manifest V3 extension. It scans the active page and generates synchronous Python Playwright page objects.

## Development

- Use Node.js 22 or later. Install locked dependencies with `npm ci`.
- Run `npm test` for the Vitest suite and `npm run build` for TypeScript checks and the extension bundle. In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
- Build before running `npm run test:browser`. The browser suite needs both Chromium and its Headless Shell plus the Python requirements in the README. Use Node and Python Playwright versions that share the same browser revision.
- Load `dist/` as an unpacked extension in Chrome or Edge. Rebuild and reload the extension after manifest or static asset changes. Keep generated output out of Git and update `package-lock.json` alongside dependency changes.
- For browser checks, serve the repository with `python -m http.server 8000` and open `http://localhost:8000/fixtures/login.html`.

## Code map

- `src/background/index.ts` configures the toolbar action to open the side panel.
- `src/content/index.ts` installs browser messaging. `elements.ts` shares discovery and identity across scans and picks. `inspector.ts` owns the inspection lifecycle, and `highlight.ts` renders isolated overlays.
- `src/core/locator.ts` and `src/core/model.ts` define the serializable model. `src/core/scoring.ts` ranks candidates and `src/core/python.ts` emits Python code.
- `src/sidepanel/index.tsx` owns scanning, permission prompts, selection, preview, and export. `manifest.json` declares extension capabilities.

## Changes to scanning and generation

- Keep scanning user-initiated. Use temporary `activeTab` access when available and request optional access for the selected site from an explicit click.
- Keep page data local. Avoid collecting input values, cookies, or tokens.
- For changes to scanning or permissions, check the unpacked extension against the login fixture. Exercise the toolbar path and test both approving and declining the optional site prompt when relevant.
- For changes to generated Python, check identifier collisions and locator uniqueness with the existing generator tests.
- Exercise repeated cards, event suppression and restoration, document changes, and detached nodes in `tests/browser/inspector.browser.ts` when changing inspector behavior.

See [architecture](docs/architecture.md) for model and validation details and [current state](docs/current-state.md) for the verification snapshot.
