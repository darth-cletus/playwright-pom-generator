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
| AC-002.23 GitHub Actions | NOT VERIFIED | The push workflow includes all local checks. A hosted run is needed to confirm the runner setup. |
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
