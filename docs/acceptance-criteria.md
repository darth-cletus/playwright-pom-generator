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
| AC-003.25 Scroll and resize geometry | PASS | Chromium compares the shadow overlay and target rectangles before and after scroll and resize and checks that the overlay follows a modal target. |
| AC-003.26 Detached references | PASS | A cloned replacement leaves a visible stale row. |
| AC-003.27 No rebinding | PASS | Replacement with the same HTML ID is assigned a new reference and row. |
| AC-003.28 Dynamic nodes | PASS | A dynamically added button can be hovered and selected with Enter. |
| AC-003.29 Tab and document scope | PASS | Chromium stops on active-tab changes and reload. |
| AC-003.30 Stale messages | PASS | Foreign document IDs resolve as stale. The panel checks port ownership and document identity. |
| AC-003.31 Unsupported pages | PASS | A browser internal page produces guidance to open a web page. |
| AC-003.32 Resume normal interactions | PASS | The page action counter increases after stopping or closing the panel. |
| AC-003.33 Resource cleanup | PASS | Overlay removal is observed after stop, Escape, page and extension reload, tab change, and panel closure. |
| AC-003.34 Valid Python | PASS | The downloaded inspector-generated source parses with the Python AST. |
| AC-003.35 JSON export | PASS | Chromium downloads and decodes a model containing selected rows and overrides. |
| AC-003.36 Static interactions | PASS | The static article gets a locator attribute with no interaction method. |
| AC-003.37 Sensitive input values | PASS | A filled password and a hidden input value never appear in the password model export. Synthetic page clicks also cannot add rows. |
| AC-003.38 Automatic scan | PASS | The original login fixture yields its five controls in the unpacked build. |
| AC-003.39 POM-002 regressions | PASS | Existing locator, panel, and Python execution tests pass. |
| AC-003.40 New coverage | PASS | Four model and protocol tests and eight unpacked-extension tests exercise the inspector. |
| AC-003.41 Existing tests | PASS | All 32 baseline tests pass. |
| AC-003.42 Production build | PASS | TypeScript and esbuild pass. |
| AC-003.43 CI | PASS | The workflow installed both Chromium binaries, ran the test suites and build, and captured fixture screenshots. [Hosted POM-003 run](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46056052235) |
| AC-003.44 Documentation | PASS | README, contributor guidance, changelog, architecture, current state, and this checklist describe the inspector. |
| AC-003.45 Permissions and services | PASS | Production permissions are unchanged. Tests use a loopback fixture server. |
| AC-003.46 Performance | PASS | The 2,500-control fixture records 500 Chromium pointer moves and a settled hover. |

### Performance measurements

On Windows in headless Chromium, each 2,500-control run dispatched 500 CDP mouse moves in 20 batches. In two runs, median batch times were 4.7–4.9 ms and p95 ranged from 8.6 to 63.7 ms. The final hover reached the panel in 342–344 ms, including the 160 ms debounce, locator computation, browser messaging, and test polling. Batch timing includes the automation transport. Pass `?large=1` on the inspector fixture URL to reproduce the large DOM. The suite prints measurements without imposing a timing threshold.

### Manual Chrome and Edge acceptance

1. Rebuild, reload the unpacked `dist/` extension, and open it via the toolbar on an HTTP or HTTPS page. If prompted, test declining site access, then approve it and retry.
2. Serve the repository with `python -m http.server 8000` and open `http://localhost:8000/fixtures/inspector.html`. Start inspection. Hover the Dental button's SVG and span, confirm the tooltip identifies a button named See plans, and inspect the ambiguous role candidate.
3. Use Parent to inspect the Dental article and add it. Return to Original target. Click the button and confirm the page action counter remains zero. Rename the row, choose a unique alternative, and click it again to verify the row and edits are preserved. Pick Vision and Life.
4. Try exact inspection on the image, a heading, a table row, and the status. Use sibling and child navigation and try Enter. Reorder and remove rows, test selection and deselection, and highlight a prior pick. Verify scrolling, resizing, and detached controls.
5. Stop using the panel and Escape. Repeat activation, switch tabs, reload the page, close the panel, and reload the extension. Verify the overlays disappear and the page action counter can increment again.
6. Generate Python, copy it, export it and the JSON model, and use the Python class in an authorized application. Review the existing automatic scan and locator checks above. Record installed Chrome and Edge results separately.

## POM-004 runtime validation acceptance

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-004.01 Architecture | PASS | ADR compares all four options and documents CDP and browser-profile tradeoffs. |
| AC-004.02 Actual Python Playwright | PASS | The companion constructs and executes real Playwright Locator objects. |
| AC-004.03 Service startup | PASS | The unpacked-extension test starts the service through the documented module entry point. |
| AC-004.04 Service shutdown | PASS | The HTTP security test closes the server and service. The CLI handles Ctrl+C. |
| AC-004.05 Offline workflow | PASS | All POM-002 and POM-003 regression tests run with the companion absent. |
| AC-004.06 Chromium connection | PASS | Live Python and extension tests attach to an isolated Chromium profile. |
| AC-004.07 Actionable connection failure | PASS | HTTP test covers an unavailable debugging endpoint. |
| AC-004.08 Disconnection | PASS | The live suite disconnects the companion and verifies that both browser pages remain open. |
| AC-004.09 Browser security restrictions | PASS | The service permits an operator-configured loopback port and setup requires a dedicated profile. |
| AC-004.10 Page correlation | PASS | The live suite discovers the marked document and confirms the intended node. |
| AC-004.11 Duplicate URLs | PASS | The live test uses two tabs at the same URL and resolves only the one with the marker. |
| AC-004.12 Stale documents | PASS | Reload removes the marker and the service rejects the prior document. |
| AC-004.13 Locator construction | PASS | Live tests cover every current strategy. |
| AC-004.14 Executable input | PASS | Schema tests reject executable strategy names and selector engines. |
| AC-004.15 Malformed requests | PASS | Contract and HTTP tests cover invalid options, types, marker syntax, and limits. |
| AC-004.16 Test ID config | PASS | One live request alternates custom and default native test-ID configuration. |
| AC-004.17 Unique matches | PASS | The Dental test ID returns one match. |
| AC-004.18 Ambiguous matches | PASS | The repeated role locator returns three matches. |
| AC-004.19 No match | PASS | The fixture test evaluates a missing CSS ID. |
| AC-004.20 Wrong target | PASS | The Vision CSS locator returns a unique wrong target while Dental is marked. |
| AC-004.21 Unverified target | PASS | Disabling target identity evidence returns a unique unverified result. |
| AC-004.22 Stale element | PASS | Live tests cover DOM replacement in Python and the extension. |
| AC-004.23 Visibility | PASS | A hidden control remains a unique confirmed match. |
| AC-004.24 Enabled state | PASS | A disabled control remains a unique confirmed match. |
| AC-004.25 Editable and checked state | PASS | Live Playwright tests cover readonly and checked input states. |
| AC-004.26 Trial behavior | PASS | The Dental click trial passes while the application's action counter stays at zero. |
| AC-004.27 Unsupported trials | PASS | The live suite verifies the explicit fill-trial unsupported result. |
| AC-004.28 Timestamps and durations | PASS | The live suite checks both fields on a confirmed match. |
| AC-004.29 Evidence provenance | PASS | Browser and Playwright evidence remain distinct in the model and panel. |
| AC-004.30 Single candidate validation | PASS | The panel exposes a per-candidate button and the service accepts one candidate. |
| AC-004.31 Multiple candidates | PASS | The unpacked extension validates every candidate on the Dental row. |
| AC-004.32 Selected batch | PASS | The unpacked extension validates locators for Dental and Vision as one selected batch. |
| AC-004.33 Progress | PASS | The panel reports current row and completion totals. |
| AC-004.34 Cancellation | PASS | The Python protocol test cancels an in-flight request and verifies cleanup. |
| AC-004.35 Partial failures | PASS | Live Playwright evaluates an invalid CSS selector and still returns the succeeding test-ID result. The panel also preserves earlier rows when later rows fail. |
| AC-004.36 Bounded operations | PASS | The contract and HTTP tests cover bounded items, timeout inputs, body sizes, and concurrent requests. |
| AC-004.37 Wrong-target recommendation | PASS | TypeScript ranking test suppresses a fresh wrong target. |
| AC-004.38 Ambiguous recommendation | PASS | TypeScript ranking and the unpacked extension cover a fresh ambiguous result. |
| AC-004.39 No-match recommendation | PASS | TypeScript ranking test suppresses a fresh no-match result. |
| AC-004.40 Manual override | PASS | The dropdown retains the user's ambiguous override in Chromium. |
| AC-004.41 Manual warning | PASS | The unpacked extension reports the conflicting result and blocks generation. |
| AC-004.42 Freshness invalidation | PASS | Live tests cover replacement and reload. The panel invalidates on configuration and connection changes. |
| AC-004.43 Historical evidence | PASS | The extension marks evidence historical after replacement and unit tests cover expiration. |
| AC-004.44 Python syntax | PASS | Existing browser tests still parse and execute generated Python. |
| AC-004.45 Evidence export | PASS | The unpacked extension downloads a model containing Playwright evidence. |
| AC-004.46 Credential-free export | PASS | The extension test checks its pairing token is absent from the JSON file. |
| AC-004.47 Loopback bind | PASS | The HTTP server binds to 127.0.0.1 only. |
| AC-004.48 Authentication | PASS | HTTP test denies an invalid bearer token. |
| AC-004.49 Website isolation | PASS | HTTP test rejects foreign origins and incorrect Host headers. |
| AC-004.50 Command boundaries | PASS | The service rejects unknown routes and accepts only allowlisted locator arguments. |
| AC-004.51 Sensitive information | PASS | State evaluation returns booleans. It does not read inputs, cookies, or storage. HTTP logs exclude pairing secrets. |
| AC-004.52 Marker cleanup | PASS | The unpacked-extension test verifies cleanup after validation and when a marked node is cloned during a lease. Release and lease expiry also cover cancellation and errors. |
| AC-004.53 Browser ownership | PASS | The live Python test verifies both user-owned pages survive companion disconnection. |
| AC-004.54 Windows setup | PASS | The companion README documents venv, pairing, profile flags, execution, and shutdown. |
| AC-004.55 Performance | PASS | The live suite measures candidate and selected-row workloads on Chromium. |
| AC-004.56 Python unit tests | PASS | Pytest covers protocol, classification, cancellation, and HTTP security. |
| AC-004.57 Live strategy tests | PASS | Actual Python Playwright exercises all current locator strategies. |
| AC-004.58 Extension integration | PASS | An unpacked Chromium extension pairs, validates, exports evidence, archives it, and resumes scanning after disconnect. |
| AC-004.59 Existing TypeScript tests | PASS | The original unit suite passes alongside the runtime tests. |
| AC-004.60 POM-002 and POM-003 regressions | PASS | The baseline and final browser suites exercise the existing workflows. |
| AC-004.61 Production extension build | PASS | Strict TypeScript checks and esbuild pass. |
| AC-004.62 Hosted CI | PASS | The hosted workflow passed the TypeScript build and tests, Ruff, pytest, and the unpacked-extension suite. [GitHub Actions evidence](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46077816340) |
| AC-004.63 Documentation | PASS | README, companion setup, architecture, roadmap, changelog, ADR, and this matrix are current. |
| AC-004.64 Threat model | PASS | Architecture documents attacker boundaries, authentication, debugging constraints, and marker limitations. |
| AC-004.65 Permissions and services | PASS | The existing optional HTTP host permission covers explicit loopback access. The runtime companion is local. |

### Measured performance

A Windows headless Chromium run attached through Python Playwright over loopback CDP. The warmed companion validated 1, 8, 10, and 50 repeated role candidates in 7, 43, 49, and 250 ms, respectively. The 50-candidate workload used two requests. A two-candidate role and test-ID workload on the 2,500-control DOM took 119 ms. Sequential per-row CSS requests with a fresh target marker on that DOM took 87 ms for 10 rows and 462 ms for 50 rows. Measurements include marker operations where applicable, CDP, and companion processing, and exclude the HTTP transport and UI. A disabled control's click trial exercised the 300 ms timeout separately. The suite reports samples without imposing timing thresholds.

### Manual Chrome and Edge acceptance

1. Follow the [companion setup](../companion/README.md). Open the same fixture URL in two tabs in the debugging profile and pair the extension in that profile. Verify a missing endpoint and an incorrect pairing token produce actionable errors.
2. Run `python -m http.server 8000 --bind 127.0.0.1` from the repository root. Open `http://127.0.0.1:8000/fixtures/inspector.html`. Inspect Dental's **See plans** button and stop picking. Validate all candidates. The role locator should show three matches and confirm Dental is among them. The native test ID should show one confirmed match.
3. Clear **Verify intended element** and validate the same ID to see one unverified match. Restore identity verification. In the local fixture, move Dental's stable HTML ID to Vision without replacing Dental, then validate the old CSS ID attached to Dental's row to see a wrong-target result. Remove that ID to see no match. Refresh the fixture afterward.
4. Validate a disabled control, optionally try a click trial, and compare state with count and identity. Verify the page action count stays unchanged. The Python fixture suite also verifies a hidden locator and read-only and checked inputs.
5. Validate several selected elements, cancel partway, and review progress. Choose a valid candidate and export Python and JSON. Confirm the JSON distinguishes both evidence sources and contains no pairing token.
6. Replace a picked node and reload. Confirm old evidence is historical. Disconnect and stop the companion with Ctrl+C. Verify standalone scan, pick, highlight, and generation still work. Record Chrome and Edge acceptance separately.

## POM-005 reusable component acceptance

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-005.01 The page object model supports reusable component definitions. | PASS | Schema v2 stores accepted definitions and shared member candidates. |
| AC-005.02 Multiple component instances can reference one component definition. | PASS | Chromium models Dental, Vision, and Life with one SpecialtyPlanCard. |
| AC-005.03 Component collections are represented explicitly. | PASS | The model stores a collection locator, sampled count, and optional key binding. |
| AC-005.04 Component definitions and instances have stable model identifiers. | PASS | Component and instance IDs derive from document identities and persist across rechecks. |
| AC-005.05 Users can manually define component roots. | PASS | The panel defines a component from a live root row. |
| AC-005.06 Component roots can be selected using the interactive inspector. | PASS | The unpacked test picks status containers with the inspector and defines a component. |
| AC-005.07 Users can discover child elements within component boundaries. | PASS | Content discovery enumerates bounded descendant member slots. |
| AC-005.08 Automatic discovery identifies representative repeated components. | PASS | The unpacked test groups the three insurance plan cards. |
| AC-005.09 Structural signatures are deterministic. | PASS | Unit tests compare normalized features independently of ordering. |
| AC-005.10 Instance-specific text does not prevent appropriate component grouping. | PASS | Card titles and descriptions differ in the fixture and still group. |
| AC-005.11 Representative minor structural variations are supported. | PASS | Only Dental includes the promotional member. |
| AC-005.12 Similar but unrelated structures are not incorrectly grouped in regression fixtures. | PASS | The notice shares the parent and basic layout but stays outside the plan group. |
| AC-005.13 Component candidate rankings are explainable. | PASS | The panel lists boundary family, sample count, overlap, and collection evidence. |
| AC-005.14 Users can accept, modify, or reject component candidates. | PASS | The panel exposes accept, reject, and editing controls. |
| AC-005.15 Component root locator candidates use the existing locator engine. | PASS | The content extractor uses the existing ElementCollection builder. |
| AC-005.16 Individual component roots support uniqueness validation. | PASS | The generator requires a unique root candidate. Live tests check root uniqueness. |
| AC-005.17 Intentional collection matches are distinguished from locator ambiguity. | PASS | Collections compare sampled or runtime counts as intentional multiplicity. |
| AC-005.18 Component-relative locator generation is supported. | PASS | Package execution uses root-bound relative member locators. |
| AC-005.19 Globally ambiguous locators can be validated within component scope. | PASS | The shared See plans role locator is ambiguous globally and unique in each card. |
| AC-005.20 Structured locator chaining is supported. | PASS | The companion and generator support a bounded root and child operation. |
| AC-005.21 Supported locator filters generate valid Playwright expressions. | PASS | Live tests and generated factories execute a Playwright containment filter. |
| AC-005.22 Arbitrary executable locator expressions are not accepted. | PASS | The dispatchers use allowlisted structured data and reject unsupported engines. |
| AC-005.23 Component instances can be identified using meaningful parameters. | PASS | Generated heading lookup resolves Life by name. |
| AC-005.24 Duplicate component identifiers are detected. | PASS | Graph validation rejects duplicate model identifiers and duplicate configured keys. |
| AC-005.25 Positional component identification is explicit rather than silently applied. | PASS | Generated nth lookup is explicit. The unit suite requires a manual choice for a positional root fallback. |
| AC-005.26 Component parameterization generates valid Python. | PASS | The generated Python uses a typed str parameter and a native role argument. |
| AC-005.27 Component collections support appropriate instance retrieval. | PASS | The unpacked test imports the ZIP and retrieves instances by heading and index. |
| AC-005.28 Collection locators use lazy resolution. | PASS | Constructors retain Locator objects and count or resolve on method calls. |
| AC-005.29 Nested components are supported. | PASS | The unpacked test creates a nested StatusBadge definition and relationship. |
| AC-005.30 Circular component relationships are rejected. | PASS | The unit suite rejects circular references. |
| AC-005.31 Nested component locators remain correctly scoped. | PASS | The generated Life instance reads the nested status through its own root. |
| AC-005.32 Shared component elements are identified. | PASS | All three plan instances emit one shared see_plans_button definition. |
| AC-005.33 Optional component elements are supported. | PASS | The Dental promotion is marked optional. |
| AC-005.34 Missing required elements produce validation failures. | PASS | The unit suite blocks generation for missing required members. |
| AC-005.35 Missing optional elements are distinguished from required-element failures. | PASS | The generated presence helper returns true for Dental and false for Vision. |
| AC-005.36 Component interaction methods reuse existing generation logic. | PASS | The same method renderer handles flat rows and component members. |
| AC-005.37 Non-interactive component elements can be used as assertion targets. | PASS | The generated package exposes heading, description, and status as assertion locators. |
| AC-005.38 Browser-side validation supports component scope. | PASS | The scoped DOM matcher uses root-local semantic indexes. |
| AC-005.39 Actual Playwright runtime validation supports composed component locators where available. | PASS | Live Python and extension tests execute composed locators over CDP. |
| AC-005.40 Component root identity and child target identity are distinguished. | PASS | The result reports root count and root identity separately from child identity. |
| AC-005.41 Wrong-target component instances are detected where target verification is supported. | PASS | The live companion test rejects a wrong root before evaluating its child. |
| AC-005.42 Component definitions can be evaluated against multiple instances. | PASS | Chromium validates the same definition across all three representative cards. |
| AC-005.43 Cross-instance validation results are displayed. | PASS | The component panel shows browser and runtime evidence per instance. |
| AC-005.44 Validation limitations and freshness are reported accurately. | PASS | Runtime evidence carries expiry and archived status. Browser results identify their method. |
| AC-005.45 Component-aware locator ranking is deterministic. | PASS | Candidates rank by valid sample coverage and score, then stable tie-breaks. |
| AC-005.46 Manual locator overrides are preserved. | PASS | Recheck preserves the selected candidate ID or displays it as unavailable. |
| AC-005.47 The side panel supports hierarchical component management. | PASS | Unpacked tests add definitions, representatives, and a nested relationship. |
| AC-005.48 Component definitions and instances are visually distinguishable. | PASS | Definitions, instances, members, and nested relationships have distinct panel sections. |
| AC-005.49 Component roots can be highlighted. | PASS | The shared overlay supports individual roots and bounded group highlights. |
| AC-005.50 Child elements can be highlighted within components. | PASS | Member rows use the existing per-node highlight command. |
| AC-005.51 Existing page elements can be moved into components. | PASS | The unpacked test invokes moving matching page rows into the component. |
| AC-005.52 Scope changes trigger appropriate locator regeneration or revalidation. | PASS | Move and restore operations use scopes verified by the content engine. |
| AC-005.53 User customizations survive component model reconciliation. | PASS | Unit tests preserve names, choices, and optionality across rechecks. |
| AC-005.54 Reusable Python component classes are generated. | PASS | Generated output contains a single SpecialtyPlanCard class. |
| AC-005.55 Multiple instances reuse the same generated component class. | PASS | Three representative page attributes reuse SpecialtyPlanCard. |
| AC-005.56 Generated component constructors accept appropriate root locators. | PASS | Component constructors accept a synchronous Playwright Locator. |
| AC-005.57 Generated component methods operate within the correct scope. | PASS | Generated click selects Vision without activating Dental or Life. |
| AC-005.58 Generated nested components use composition. | PASS | The browser test imports the ZIP and reads nested StatusBadge content. |
| AC-005.59 Generated Python identifiers are valid and collision-safe. | PASS | Model validation and the shared Python name allocator prevent identifier collisions. |
| AC-005.60 Existing flat page object generation remains available. | PASS | Existing unversioned flat models and generator tests continue to pass. |
| AC-005.61 Single-file component generation is supported. | PASS | The panel renders page and component classes as a single Python preview. |
| AC-005.62 Multi-file Python generation is supported. | PASS | The unpacked extension downloads a package ZIP. |
| AC-005.63 Generated package imports resolve successfully. | PASS | Python imports the generated page and both component modules from the ZIP. |
| AC-005.64 Generated Python passes syntax validation. | PASS | The package test parses every file with Python AST. |
| AC-005.65 Generated component classes execute successfully against representative fixtures. | PASS | The exported package executes against the plan fixture using Python Playwright. |
| AC-005.66 JSON exports preserve component definitions and relationships. | PASS | The unpacked test checks version, instances, and nested links in downloaded JSON. |
| AC-005.67 JSON schema evolution is documented and tested. | PASS | Schema v2 behavior and unsupported versions are tested. |
| AC-005.68 Existing flat models remain supported or have an explicit migration path. | PASS | Unversioned and v1 flat generation remain supported. |
| AC-005.69 Invalid component references are rejected. | PASS | Unit tests reject missing definition references. |
| AC-005.70 Component discovery performance is evaluated using representative fixtures. | PASS | Chromium measures the 650-extra-boundary fixture from discovery click to panel result. |
| AC-005.71 Discovery and validation resource consumption is bounded. | PASS | Explicit root, member, proposal, nesting, request, and highlight bounds apply. |
| AC-005.72 Sensitive input values are not collected or persisted. | PASS | Discovery uses existing metadata and never reads input values. |
| AC-005.73 DOM-derived content cannot introduce arbitrary generated code. | PASS | Structured locators and sanitized names constrain generated Python and ZIP paths. |
| AC-005.74 The extension remains functional without the optional runtime validator. | PASS | Unpacked discovery, model editing, and ZIP execution run with the companion absent. |
| AC-005.75 Automated tests cover the component domain model. | PASS | Unit tests cover graph, serialization, candidate selection, and reconciliation. |
| AC-005.76 Automated tests cover discovery and similarity analysis. | PASS | Unit and unpacked tests cover structural similarity, variants, and unrelated markup. |
| AC-005.77 Actual Playwright tests cover scoped locator semantics. | PASS | Live Playwright verifies confirmed, wrong, and ambiguous root behavior. |
| AC-005.78 Automated tests cover generated component execution. | PASS | Real downloaded Python modules are imported and executed. |
| AC-005.79 Existing TypeScript tests continue to pass. | PASS | All existing TypeScript unit tests pass. |
| AC-005.80 Existing Python tests continue to pass where applicable. | PASS | The original companion tests pass with added scoped cases. |
| AC-005.81 Existing POM-002 through POM-004 functionality remains operational. | PASS | All prior feature suites remain in the final regression run. |
| AC-005.82 The production browser extension builds successfully. | PASS | TypeScript checking and bundle generation pass. |
| AC-005.83 GitHub Actions workflows remain functional. | PASS | Hosted TypeScript, Python, and unpacked Chromium checks passed. [Hosted run](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46082106616) |
| AC-005.84 Documentation accurately reflects the implementation. | PASS | README, ADR, architecture, changelog, current state, and matrix describe v0.5. |
| AC-005.85 No unjustified extension permissions or external services are introduced. | PASS | Production manifest permissions remain unchanged and the companion stays local. |

### Repeat discovery and runtime evidence

The Chromium test observed one three-instance plan definition for Dental, Vision, and Life. The notice was outside that group. The promotion was present for Dental and optional for the other two. The companion verified one intended root and one intended button in each card. A separate live check rejected a Vision root while Dental was marked. A three-root chain returned the root ambiguity without evaluating children.

Windows headless Chromium measurements from the detector benchmark:

| Fixture | Candidate roots | Similarity comparisons | Groups | Representative roots | Collection count | Detector time |
| --- | --- | --- | --- | --- | --- | --- |
| Three cards | 4 | 2 | 1 | 3 | 3 | 3.3 ms |
| 20 cards | 21 | 19 | 1 | 20 | 20 | 3.9 ms |
| 100 cards | 101 | 99 | 1 | 30 | 100 | 11.9 ms |
| 120 table rows | 120 | 119 | 1 | 30 | 120 | 17.1 ms |

The detector timer covers discovery and candidate construction inside Chromium. Candidate counts can include an enclosing container. Instance observations remain capped while a verified collection retains its full observed count. On the nested plan fixture with 650 extra boundaries, discovery reached the panel in 124 ms. The three-card CDP validation batch reached the panel in 2,015 ms in a separate run. Both panel timings include messaging and test polling. The fixture supports `?large=1` for a manual run. The browser suite logs observations without imposing a timing threshold. Memory use was not measured.

### Manual Chrome and Edge acceptance

1. Build and load the unpacked extension. Serve `fixtures/components.html` over loopback. Scan it and open **Reusable components**. Discover and accept the plan group. Review that the notice stays outside it and the promotion is optional.
2. Rename the class to `SpecialtyPlanCard`. Review **Instances** and **Members**, highlight roots and members, and inspect the exact role locator for **See plans**. Rename a row, move matching rows into the component, recheck, and verify the edits survive.
3. In the inspector pick the status container in each card. Define one status component and add the other roots. Link it under the plan definition as a nested instance. Review the scope evidence and remove the nested class's page exposure if desired.
4. Pair with the v0.5 companion. Choose **Validate component with Playwright**. Inspect root and child identity, heading parameter lookups, each sampled member, and intentional collection counts.
5. Export Python, ZIP, and JSON. Import the generated package and use `get_specialty_plan_card("Vision")` to exercise only the Vision button. Check the promotion's presence helper and the nested status.
6. Reload or replace a sampled root. Check that prior runtime evidence is historical, and recheck against live roots. Disconnect the companion and repeat browser-only discovery. Record installed Chrome and Edge acceptance separately.
