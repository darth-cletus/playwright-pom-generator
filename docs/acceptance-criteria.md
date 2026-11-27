# POM-002 acceptance

PASS records exercised behavior or directly reviewed implementation. NOT VERIFIED records a check that still requires evidence.

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-002.01 Modular locator engine | PASS | Accessibility, metadata, proposals, validation, scoring, and Python output have separate modules. |
| AC-002.02 Native and ARIA roles | PASS | Chromium verifies native controls, contextual roles, and explicit ARIA roles. |
| AC-002.03 Accessible names | PASS | The accessibility library and fixture cover naming precedence, hidden references, alternative text, and public button values. |
| AC-002.04 Associated labels | PASS | Chromium verifies explicit, wrapped, multiple, dynamic, and ARIA labels, including passwords. |
| AC-002.05 Native Python strategies | PASS | The browser suite exercises all strategy selectors and parses the generated Python. |
| AC-002.06 Test ID configuration | PASS | Ordered settings and candidate ranking are tested, and the panel saves preferences with extension storage. |
| AC-002.07 Test ID compatibility | PASS | The custom configuration test verifies the native call and CSS alternatives against Playwright. |
| AC-002.08 Unstable identifiers | PASS | Unit tests cover warnings, penalties, and stable numbered identifiers. |
| AC-002.09 Multiple candidates | PASS | Fixture controls produce multiple validated strategies. |
| AC-002.10 Explainable ranking | PASS | Unit tests exercise tie-breaking, score configuration, and explanations. |
| AC-002.11 Deduplication | PASS | Duplicate test attributes produce one candidate per strategy and argument key. |
| AC-002.12 Inspect alternatives | PASS | The panel renders strategy, Python, match count, status, score, explanations, and warnings. |
| AC-002.13 Manual override | PASS | The Chromium panel test chooses an alternative locator and updates the Python preview. |
| AC-002.14 Override in Python and JSON | PASS | Unit and panel tests preserve the selected ID across renaming, selection, export, and generation. |
| AC-002.15 Restore automatic | PASS | The panel test returns from the label override to the recommended test ID. |
| AC-002.16 Match statuses | PASS | Chromium covers ambiguous, missing, wrong-target, and unique matches. |
| AC-002.17 Validation provenance | PASS | Candidate evidence and UI distinguish exact CSS, browser approximation, and Playwright runtime. |
| AC-002.18 Invalid selectors | PASS | Chromium checks that invalid CSS returns validation error. |
| AC-002.19 Python syntax | PASS | Python parses the generated fixture model with `ast.parse`. |
| AC-002.20 New tests | PASS | Vitest unit and Chromium suites cover ranking, semantic strategies, scanning, and the UI. |
| AC-002.21 Existing tests | PASS | The four original generator assertions still run against structured candidates. |
| AC-002.22 Build | PASS | TypeScript and the production extension build pass locally. |
| AC-002.23 GitHub Actions | PASS | The hosted workflow completed dependency installation, unit tests, the build, and browser tests. [GitHub Actions run](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46052250012) |
| AC-002.24 Documentation | PASS | README, changelog, guidance, architecture, current state, roadmap, and this checklist cover the implementation. |
| AC-002.25 Permissions and services | PASS | The storage permission saves preferences. Scanning and generation remain local. |

## Manual Chrome and Edge regression checklist

Build the extension with `npm ci` and `npm run build`. Load or reload `dist/` under Developer mode at `chrome://extensions` or `edge://extensions`. From the project root, run `python -m http.server 8000` and use the fixture URLs under `http://localhost:8000/fixtures/`. On Windows, `py -m http.server 8000` also works.

| # | Check | Evidence before manual acceptance |
| --- | --- | --- |
| 1 | Open the panel with the extension toolbar in Chrome and Edge. | NOT VERIFIED in the installed extension. |
| 2 | Scan `login.html`. | Content scan passed in Chromium. Installed-extension check pending. |
| 3 | Scan an application you have access to. Try the optional site prompt, decline it, then approve it and confirm the retry. | NOT VERIFIED in the installed extension. |
| 4 | Verify that visible controls on `locators.html` are discovered and a hidden button is omitted. | Chromium fixture test passed. |
| 5 | Inspect counts, validation method, explanations, and alternatives. Verify that repeated Edit buttons have a unique structural fallback. | Chromium fixture test passed. |
| 6 | Highlight a control and verify the overlay appears on the intended element. | Chromium content script test passed. |
| 7 | Toggle an element and try Select all and Clear all. | Individual toggling passed in the panel test. Bulk controls need a manual check. |
| 8 | Rename an element and the class. Verify an override survives renaming and can be reset. | Element renaming and override reset passed in the panel test. Class rename needs a manual check. |
| 9 | Generate Python with automatic and manual choices. Choose an ambiguous alternative and confirm generation is blocked. | Unit, panel, and Python tests passed. |
| 10 | Copy the preview to the clipboard. | NOT VERIFIED in the installed extension. |
| 11 | Export a Python file and open it. | Generated source executes in tests. Browser download needs a manual check. |
| 12 | Export JSON and confirm the structured locators and selected candidate ID are present. | Serialization passed. Browser download needs a manual check. |
| 13 | Import the exported class into an actual Playwright script and perform interactions. | Generated fixture class executed in Python Playwright. Application-specific verification pending. |
| 14 | Run `npm test`. | Local unit suite passed. |

For the settings regression, save a different recognized attribute order, reopen the panel, and verify it persists. Set a nondefault Playwright test ID attribute only after configuring the Playwright project to use it. Rescan and verify that other recognized attributes generate CSS.

## POM-003 inspector acceptance

The browser tests load the production bundle as an unpacked extension in an isolated Chromium profile. The test manifest pregrants only the loopback fixture host, and the tests open the side-panel entry page directly. Manual Chrome and Edge checks include the native toolbar and permission prompt.

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-003.01 Activate in side panel | PASS | Chromium activates from Start inspection. |
| AC-003.02 Stop in side panel | PASS | Chromium stops and observes overlay removal. |
| AC-003.03 Escape stops | PASS | Page keyboard input stops the active session. |
| AC-003.04 Repeated activation | PASS | A duplicate start on the same port yields one active event. |
| AC-003.05 Hover highlight | PASS | Nested Dental content displays a hover box. |
| AC-003.06 Interactive ancestor | PASS | Nested SVG and label cases resolve to the button or input. |
| AC-003.07 Exact node | PASS | Exact mode targets an image and SVG directly. |
| AC-003.08 Static selection | PASS | The Dental article enters the collection as an assertion locator. |
| AC-003.09 Hover tooltip | PASS | The Chromium overlay renders target information, count or validation status, and dimensions. |
| AC-003.10 Hit testing | PASS | Page hit testing still returns the button span under the overlay. |
| AC-003.11 Parent | PASS | Navigation moves from the Dental button to its article. |
| AC-003.12 Children and siblings | PASS | Chromium navigates between SVG and span and from the button to a child. |
| AC-003.13 Hierarchy | PASS | The panel renders the ancestry from document root to the target. |
| AC-003.14 Click selects | PASS | Clicking Dental's span adds the button. |
| AC-003.15 Suppress application activation | PASS | Captured pointer and mouse gestures leave the application's action counter at zero. |
| AC-003.16 Multiple picks | PASS | An article and two buttons are collected in one session. |
| AC-003.17 Shared page model | PASS | Scan and pick update the same model and JSON export. |
| AC-003.18 Duplicate prevention | PASS | Clicking a scanned or previously picked node preserves the row count. |
| AC-003.19 Preserve names | PASS | Renamed rows retain their names after a duplicate pick. |
| AC-003.20 Preserve manual choices | PASS | Selected CSS override survives a repeat pick and export. |
| AC-003.21 Shared engine | PASS | Inspected and scanned controls both use the existing candidate builder and validator. |
| AC-003.22 Candidate details | PASS | Repeated role candidates show ambiguity and competing strategies in the panel. |
| AC-003.23 Safeguards | PASS | Ambiguous selection blocks Python generation, and POM-002 wrong-target tests still pass. |
| AC-003.24 Prior highlight | PASS | Shared highlight service handles both picked and scanned references. |
| AC-003.25 Scroll and resize geometry | PASS | Chromium compares the shadow overlay and target rectangles before and after scroll and resize. |
| AC-003.26 Detached references | PASS | A cloned replacement leaves a visible stale row. |
| AC-003.27 No rebinding | PASS | Replacement with the same HTML ID is assigned a new reference and row. |
| AC-003.28 Dynamic nodes | PASS | A dynamically added button can be hovered and selected with Enter. |
| AC-003.29 Tab and document scope | PASS | Chromium stops on active-tab changes and reload. |
| AC-003.30 Stale messages | PASS | Foreign document IDs resolve as stale. The panel checks port ownership and document identity. |
| AC-003.31 Unsupported pages | PASS | A browser internal page produces guidance to open a web page. |
| AC-003.32 Resume normal interactions | PASS | The page action counter increases after stopping or closing the panel. |
| AC-003.33 Resource cleanup | PASS | Overlay removal is observed after stop, Escape, reload, tab change, and panel closure. |
| AC-003.34 Valid Python | PASS | The downloaded inspector-generated source parses with the Python AST. |
| AC-003.35 JSON export | PASS | Chromium downloads and decodes a model containing selected rows and overrides. |
| AC-003.36 Static interactions | PASS | The static article gets a locator attribute with no interaction method. |
| AC-003.37 Sensitive input values | PASS | A filled password and a hidden input value never appear in the password model export. Synthetic page clicks also cannot add rows. |
| AC-003.38 Automatic scan | PASS | The original login fixture yields its five controls in the unpacked build. |
| AC-003.39 POM-002 regressions | PASS | Existing locator, panel, and Python execution tests pass. |
| AC-003.40 New coverage | PASS | Four model and protocol tests and seven unpacked-extension tests exercise the inspector. |
| AC-003.41 Existing tests | PASS | All 32 baseline tests pass. |
| AC-003.42 Production build | PASS | TypeScript and esbuild pass. |
| AC-003.43 CI | NOT VERIFIED | The workflow installs full Chromium and the Headless Shell. Hosted POM-003 result pending. |
| AC-003.44 Documentation | PASS | README, contributor guidance, changelog, architecture, current state, and this checklist describe the inspector. |
| AC-003.45 Permissions and services | PASS | Production permissions are unchanged. Tests use a loopback fixture server. |
| AC-003.46 Performance | PASS | The 2,500-control fixture records 500 Chromium pointer moves and a settled hover. |

### Performance measurements

On Windows in headless Chromium, a local run with 2,500 controls dispatched 500 CDP mouse moves in 20 batches. The median batch completion was 4.9 ms and p95 was 8.6 ms. The final hover reached the panel in 342 ms, including the 160 ms debounce, locator computation, browser messaging, and test polling. Batch timing includes the automation transport. Pass `?large=1` on the inspector fixture URL to reproduce the large DOM. The suite prints measurements without imposing a timing threshold.

### Manual Chrome and Edge acceptance

1. Rebuild, reload the unpacked `dist/` extension, and open it via the toolbar on an HTTP or HTTPS page. If prompted, test declining site access, then approve it and retry.
2. Serve the repository with `python -m http.server 8000` and open `http://localhost:8000/fixtures/inspector.html`. Start inspection. Hover the Dental button's SVG and span, confirm the tooltip identifies a button named See plans, and inspect the ambiguous role candidate.
3. Use Parent to inspect the Dental article and add it. Return to Original target. Click the button and confirm the page action counter remains zero. Rename the row, choose a unique alternative, and click it again to verify the row and edits are preserved. Pick Vision and Life.
4. Try exact inspection on the image, a heading, a table row, and the status. Use sibling and child navigation and try Enter. Reorder and remove rows, test selection and deselection, and highlight a prior pick. Verify scrolling, resizing, and detached controls.
5. Stop using the panel and Escape. Repeat activation, switch tabs, reload the page, close the panel, and reload the extension. Verify the overlays disappear and the page action counter can increment again.
6. Generate Python, copy it, export it and the JSON model, and use the Python class in an authorized application. Review the existing automatic scan and locator checks above. Record installed Chrome and Edge results separately.
