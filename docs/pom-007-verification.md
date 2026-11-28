# POM-007 verification

POM-007 adds iframe and open shadow DOM support in the v0.7.0 extension and companion. Same-origin frames, nested accessible documents and mixed frame and shadow paths work in discovery and generated Python. Authorized direct cross-origin frames can be scanned, inspected and validated. The acceptance matrix records coverage and gaps.

## Architecture and implementation

- `src/core/context.ts` models persistent owner paths. `src/content/contexts.ts`, `elements.ts` and `validation.ts` walk accessible documents and open roots, resolve typed locators and reject ambiguous boundaries.
- `src/content/frame-bridge.ts` and `src/sidepanel/frames.ts` correlate authorized child documents with their DOM owners. The panel uses Chrome document IDs when routing inspection and validation. The handshake links the sender window to the owner element.
- `src/content/lifecycle.ts` and `live-discovery.ts` observe supported frame and shadow changes. Replaced contexts invalidate the old targets while retaining their model entries.
- `src/content/inspector.ts` resolves composed event targets and frame-local selections. `highlight.ts` maps same-origin frame coordinates into the parent viewport.
- `src/core/locator.ts`, `python.ts`, and the Python companion share the frame operation. Frame transitions emit lazy `.content_frame` calls. The companion distinguishes parent resolution, target identity and uniqueness.
- `src/core/model.ts` exports schema v3 for scoped models and strips transient references. Legacy flat and v2 component exports remain compatible.
- [ADR 0004](decisions/0004-scoped-browsing-contexts.md) documents the context model, permissions and protocol compatibility.

| Tasks | Status |
| --- | --- |
| .01–.07 | Paths, owner identity, targeted injection and direct cross-origin access implemented. Automatically reconciling nested cross-origin registration remains open. |
| .08–.12 | Frame-scoped scans, references, owner selectors, typed composition and conservative uniqueness implemented. Detailed per-hop ranking remains limited. |
| .13–.22 | Open and nested roots, mixed paths, scoped names, composed events and basic slots implemented. Rich slot metadata and dynamic slot editing coverage remain open. |
| .23–.24 | Supported component roots and relative members implemented. Equivalent definitions across unrelated context paths remain a review workflow. |
| .25–.29 | Scoped semantic and exact inspection, composed hierarchy, highlighting and browser validation implemented. Cross-origin inspection requires switching to the authorized frame. |
| .30–.34 | Optional companion resolves frame paths and verifies top and child leases. Per-hop error detail and narrower invalidation remain open. |
| .35–.37 | Context filtering, explicit scan actions, diagnostics and document-scoped routing implemented. |
| .38–.41 | Lazy frame and shadow Python, relative component members and portable scoped exports implemented. |
| .42–.45 | Traversal, messaging and lease budgets, resource cleanup and local permission boundaries implemented. Extended soak and memory measurements remain open. |
| .46–.47 | Browser fixtures, companion and contract tests, documentation and an acceptance matrix added. |

## Verification

The POM-006 baseline passed 42 TypeScript, 27 Chromium and 17 companion tests. POM-007 passed 44 TypeScript, 32 Chromium and 18 companion tests, along with the production build, type checking and Ruff. The browser suite loads the production extension in a disposable Chromium profile. It uses two synthetic loopback hostnames for cross-origin tests and pregrants access to avoid automating native permission prompts. [Passing hosted workflow and screenshots](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46108161791)

Automated cases exercise nested iframe entry from an open root, duplicate labels across scopes, a sandboxed frame, authorized cross-origin discovery and inspection, dynamically inserted and replaced frames, an unavailable persistent row, and generated Python in real Playwright. Companion coverage confirms a target in a shadow root, rejects a different frame with the same target label, and reports an ambiguous root. The unpacked-extension runtime test verifies an authorized cross-origin result and invalidation after a child DOM change.

## Generated Python

```python
self.confirm = (
    page.locator('iframe[id="billing"]').content_frame
    .locator('div[id="secure"]')
    .get_by_test_id("submit")
)
```

Nested paths chain additional `.content_frame` operations. Reusable components can use the same operation relative to a component root. Playwright resolves the locators when a method interacts with the page.

## Performance and diagnostics

On the Windows Chromium runner, in-page scans measured 4 ms for a top document, 11 ms for 10 frames, 28 ms for 50 frames, 13 ms for 100 hosts with 64 contexts retained, and 10 ms for 10 frames plus 25 hosts. A smaller mixed unpacked-extension scan reached the panel in 79 ms. These workloads used one interactive control per context. The tests record context and row counts. A POM-006 50,000-node benchmark from the same branch reached the panel in 361 ms after a live insertion and 336 ms after a full rescan, and an overflow-triggered rescan settled in 422 ms after 1,000 records. These are single runs.

The limits are four path boundaries, 64 discovered contexts, 64 observed trees, and 12 authorized child document scans per action. Performance for many interactive controls per frame, long-running shadow-local churn, memory use and message counts remains unmeasured.

## Security and privacy

The browser enforces host permissions and sandbox restrictions. The panel requests the optional `webNavigation` permission and one host pattern from the explicit embedded scan action. It filters the active tab's metadata by exact origin and parent document. The owner handshake checks a nonce, origin, browser-trusted message and sender window. Extension IPC checks sender and message shape. Same-origin and shadow traversal use public DOM APIs. Closed roots are neither probed nor inferred. Scoped export removes transient IDs and markers. Form values and browser storage are not scanned. Runtime validation stays within the authenticated local companion.

## Installed Chrome and Edge checklist

1. Build with `npm run build` and load `dist` as unpacked. Run `python -m http.server 8000` and open `http://127.0.0.1:8000/fixtures/contexts.html` with the toolbar. Check **Browsing contexts**, filtering, and selected-context scans.
2. Open the same URL with `?cross-origin` to add a localhost iframe. Test denying and approving access. Verify ordinary scans after denial and frame-local highlighting and cleanup after approval.
3. Inspect an open shadow control alongside a duplicate label in another root. Check boundary navigation, selection suppression, host replacement and manual refresh after attaching a shadow root.
4. Pair the v0.7.0 companion with an isolated Chromium debugging profile. Validate a frame target, navigate the iframe and confirm the old evidence becomes historical. Execute exported Python against the fixture.
5. Close and reopen the side panel. Check that unpaired startup, denied frames and closed or opaque boundaries produce usable status feedback.

## Limitations and follow-up

Cross-origin scanning supports direct children. Cross-origin descendants under another embedded document may need an independent authorized registration flow. Navigation of a cross-origin frame retires the old rows and requires rescanning the associated origin. Same-origin live changes use a shared observer, and frame navigation can trigger a document-wide synchronization. Exact names and selector matching remain browser approximations until the companion checks the candidate. Closed shadow roots and opaque sandboxes remain inaccessible. Newly attached roots with no observable host mutation require manual refresh.

Future work can use the portable path and revision-bound identity to reconcile mixed-context models. Remaining work includes a richer slot and frame registry, per-segment validation diagnostics, cross-context component equivalence, clipped or rotated highlight geometry, and a long-running resource and permissions matrix.

## Git

The implementation branch is `feature/POM-007-iframe-shadow-dom`, stacked on POM-006. Both packages are v0.7.0. The companion uses protocol v1 and advertises the additive `frame` capability. Scoped model exports use schema v3. [Draft pull request #6](https://github.com/darth-cletus/playwright-pom-generator/pull/6)

## Acceptance criteria

PASS records automated evidence or directly reviewed behavior. FAIL records a known implementation gap. NOT VERIFIED records missing evidence.

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-007.01 | A unified browsing context model is implemented. | PASS | Typed BrowsingContext and ADR 0004. |
| AC-007.02 | Frame documents and shadow root tree scopes are distinguished. | PASS | Distinct frame and shadow steps. |
| AC-007.03 | Frame hierarchy relationships are represented explicitly. | PASS | Ordered owner path traversed in nested Chromium fixture. |
| AC-007.04 | Frame owner identity is distinguished from frame document identity. | PASS | Owner handshake and document-scoped Chrome routing. |
| AC-007.05 | Live context identity is distinguished from persistent model identity. | PASS | Persistent locator paths and independent live references. |
| AC-007.06 | Context descriptions are serializable without live browser references. | PASS | Schema-v3 unit and Chromium export assertions. |
| AC-007.07 | Same-origin frames are discovered. | PASS | Unpacked billing iframe scan. |
| AC-007.08 | Nested frames are discovered. | PASS | Nested iframe inside an open root exercised. |
| AC-007.09 | Dynamically inserted frames are discovered. | PASS | Dynamic srcdoc insertion Chromium test. |
| AC-007.10 | Cross-origin frame boundaries are identified. | PASS | Panel identifies the separate localhost iframe. |
| AC-007.11 | Authorized cross-origin frame content can be discovered. | PASS | Authorized Chromium test scans the external frame. |
| AC-007.12 | Inaccessible frames are reported accurately. | PASS | Sandbox boundary is unavailable in Chromium. |
| AC-007.13 | Permission denial does not prevent ordinary extension functionality. | NOT VERIFIED | The decline path returns without changing the model. Native prompts require manual Chrome and Edge checks. |
| AC-007.14 | Optional permissions are requested through appropriate user interaction. | PASS | Embedded scan button explicitly invokes optional permission request. |
| AC-007.15 | Duplicate frame URLs do not cause context identity collisions. | NOT VERIFIED | Correlation uses a sender window and Chrome document ID. A duplicate-URL case is not explicit in the Chromium suite. |
| AC-007.16 | Frame owner correlation uses reliable evidence. | PASS | Nonce, trusted event, origin, sender window and parent document. |
| AC-007.17 | Ambiguous frame owner correlation is reported rather than guessed. | PASS | Owner must resolve uniquely; otherwise the panel reports unavailable. |
| AC-007.18 | Supported srcdoc and about:blank frame scenarios are handled. | NOT VERIFIED | srcdoc is exercised. about:blank has a code path and still requires targeted verification. |
| AC-007.19 | Sandboxed frame accessibility limitations are reported accurately. | PASS | Opaque sandbox fixture remains unavailable. |
| AC-007.20 | Frame creation is reflected in the context registry. | PASS | Inserted frame appears in live discovery. |
| AC-007.21 | Frame removal is reflected in the context registry. | PASS | Removing the srcdoc frame retires the observed target. |
| AC-007.22 | Frame navigation updates document identity. | PASS | Reloaded srcdoc document creates new references. |
| AC-007.23 | Frame replacement is handled safely. | PASS | Frame replacement preserves the old edited model row as unavailable. |
| AC-007.24 | Frame-local SPA navigation is supported where accessible. | NOT VERIFIED | Accessible child Navigation API events are subscribed. Child pushState behavior is not separately exercised. |
| AC-007.25 | Stale frame document messages are rejected. | PASS | Chrome document targeting and stale scope reference checks. |
| AC-007.26 | Duplicate element identifiers across frames remain distinct. | PASS | Equal Confirm controls retain distinct identities in Chromium. |
| AC-007.27 | Persistent model elements survive temporary frame unavailability. | PASS | Live fixture retains a renamed unavailable row. |
| AC-007.28 | Frame owner locator candidates use the existing locator engine. | PASS | Owner selectors use shared structured locators and the DOM matcher. |
| AC-007.29 | Frame owner uniqueness is evaluated within the parent context. | PASS | Owner match is scoped to its parent tree. |
| AC-007.30 | Ambiguous frame owners are not silently resolved by positional selection. | PASS | Ambiguous matches are rejected without nth fallback. |
| AC-007.31 | Structured locator composition supports explicit frame transitions. | PASS | Shared frame locator contract. |
| AC-007.32 | Nested frame locator generation is supported. | PASS | Nested path exercised in Chromium and unit code generation. |
| AC-007.33 | Component-relative frame locators are supported. | PASS | Generated component member executes with real Python. |
| AC-007.34 | Frame locator ranking considers the complete context path. | FAIL | Checks the full path, but score explanations are inherited from the target and do not rank owner health. |
| AC-007.35 | Unsupported locator operation combinations are rejected. | PASS | User-defined filter targets cannot enter frames in either contract. |
| AC-007.36 | Open shadow roots are discovered. | PASS | Open roots found by Chromium. |
| AC-007.37 | Elements inside open shadow roots are discovered. | PASS | Duplicate Confirm labels discovered successfully in open roots. |
| AC-007.38 | Nested open shadow roots are discovered. | NOT VERIFIED | Recursive open roots are supported by the traversal. Nested shadow-only fixtures have no dedicated check. |
| AC-007.39 | Shadow roots inside accessible frames are discovered. | PASS | Billing iframe provides an open root. |
| AC-007.40 | Shadow host ancestry is represented explicitly. | PASS | Host represented in path and UI. |
| AC-007.41 | Shadow-local DOM mutations are observed. | NOT VERIFIED | The shared observer registers open roots. A long-running shadow-local mutation fixture is still pending. |
| AC-007.42 | Dynamically attached open shadow roots are discovered through supported mechanisms or documented refresh behavior. | PASS | Full rescan refreshes a late attached root. |
| AC-007.43 | Shadow host removal releases associated resources. | NOT VERIFIED | Observer targets are rebuilt when open-tree membership changes. Dedicated shadow root cleanup coverage is pending. |
| AC-007.44 | Shadow host replacement is handled safely. | NOT VERIFIED | Weak references and owner paths enforce availability. Shadow-host replacement needs a dedicated browser regression. |
| AC-007.45 | Named and default slot relationships are represented appropriately. | FAIL | Composed navigation follows assigned slots, but persistent named-slot metadata is absent. |
| AC-007.46 | Slotted elements are not incorrectly duplicated. | NOT VERIFIED | Traversal scans a slotted light element in its actual tree. A dedicated duplicate-slot fixture is pending. |
| AC-007.47 | Dynamic slot assignment changes are handled. | FAIL | DOM and host changes refresh observations; slotchange-specific tracking is missing. |
| AC-007.48 | DOM containment is distinguished from composed-tree containment. | PASS | Composed parent and containment helpers are distinct from native DOM queries. |
| AC-007.49 | Accessible metadata is computed within appropriate tree scopes. | PASS | Labels and scoped ID references resolve within their tree. |
| AC-007.50 | Duplicate IDs across unrelated tree scopes do not corrupt accessible-name resolution. | PASS | Scoped ID lookups use getRootNode. |
| AC-007.51 | Browser-side accessibility limitations are documented accurately. | PASS | Verification report documents browser approximation. |
| AC-007.52 | Native Playwright shadow-piercing locator strategies are supported. | PASS | Generated native Playwright selectors executed. |
| AC-007.53 | Explicit shadow host scoping is supported. | PASS | Explicit owner chaining distinguishes duplicate shadow controls. |
| AC-007.54 | Nested shadow host scoping is supported. | NOT VERIFIED | Host scopes compose recursively. Nested host-only generation is not separately executed. |
| AC-007.55 | Shadow DOM locator uniqueness reflects the intended search scope. | PASS | Browser matcher checks the full scoped candidate against the target. |
| AC-007.56 | Unsupported shadow DOM selector syntax is not generated. | PASS | Typed CSS and Playwright selectors. |
| AC-007.57 | XPath is not generated to cross shadow boundaries. | PASS | Structured locator contract rejects XPath. |
| AC-007.58 | Closed shadow root limitations are reported accurately. | PASS | Panel and ADR describe closed-root access limits. |
| AC-007.59 | Unknown shadow root accessibility is not incorrectly reported as confirmed closed-root status. | PASS | Absent public shadow root has no closed classification. |
| AC-007.60 | Closed shadow root encapsulation is not bypassed. | PASS | Only public open shadowRoot is traversed. |
| AC-007.61 | Frames containing open shadow roots are supported. | PASS | Billing frame open-root fixture. |
| AC-007.62 | Open shadow roots containing accessible frames are supported. | PASS | Nested iframe is hosted in the billing shadow root. |
| AC-007.63 | Mixed frame and shadow DOM locator paths are represented correctly. | PASS | Mixed scope path exercised by Chromium and unit generation. |
| AC-007.64 | Reusable components can be defined inside frames. | PASS | Component roots inside frames use the scoped root builder. |
| AC-007.65 | Reusable components can be rooted at shadow hosts. | NOT VERIFIED | Component member discovery enters open roots. A dedicated manually selected shadow-host generation test is pending. |
| AC-007.66 | Components containing iframe transitions are supported. | PASS | Generated component with iframe-relative member executes. |
| AC-007.67 | Nested context-aware components use composition. | NOT VERIFIED | Composition exists, but a generated nested mixed-context package has not been executed. |
| AC-007.68 | Component definitions can be reused across equivalent contexts. | FAIL | Generation supports scoped components. Definition reuse across independent paths has no dedicated workflow. |
| AC-007.69 | Unrelated contexts are not incorrectly grouped during component discovery. | PASS | Automatic component grouping is keyed by the actual parent element. |
| AC-007.70 | User-defined component boundaries remain preserved. | PASS | Component editing and reconciliation retain user-defined boundaries. |
| AC-007.71 | Elements inside accessible frames can be inspected. | PASS | Same-origin and authorized cross-origin inspection exercised. |
| AC-007.72 | Elements inside open shadow roots can be inspected. | PASS | Inspector selects a shadow-hosted payment control. |
| AC-007.73 | Shadow DOM event retargeting is handled appropriately. | PASS | Event handling starts from composedPath. |
| AC-007.74 | Semantic target resolution works across supported contexts. | PASS | Inspector recognizes Cardholder inside an authorized frame. |
| AC-007.75 | Exact DOM target selection remains available. | PASS | Existing exact inspector test remains available. |
| AC-007.76 | Frame hierarchy navigation is supported. | NOT VERIFIED | Same-origin hierarchy traversal crosses owner boundaries. Dedicated inspector navigation assertions are pending. |
| AC-007.77 | Shadow host hierarchy navigation is supported. | NOT VERIFIED | Inspector parent traversal follows a shadow host. Dedicated hierarchy assertions are pending. |
| AC-007.78 | Frame-local highlighting works correctly. | PASS | Same-origin frame and authorized child overlay paths implemented. |
| AC-007.79 | Shadow DOM element highlighting works correctly. | PASS | Chromium highlights an open-shadow control inside a frame. |
| AC-007.80 | Highlighting resources are cleaned up when contexts disappear. | NOT VERIFIED | Frame-navigation and extension cleanup are exercised. Shadow-host disappearance geometry remains unverified. |
| AC-007.81 | Inspector selection does not unintentionally activate representative application controls. | PASS | Existing inspector gesture-suppression tests and scoped event wiring. |
| AC-007.82 | Browser-side validation supports context-aware locators. | PASS | Browser matcher executes frame steps and host descendants. |
| AC-007.83 | Browser-side approximations are distinguished from actual Playwright validation. | PASS | Browser approximation and Python runtime shown separately. |
| AC-007.84 | Runtime frame correlation does not rely solely on URL equality. | PASS | Random markers in both documents and strict owner path. |
| AC-007.85 | Ambiguous runtime frame correlation is rejected. | PASS | Python rejects ambiguous owner fixture. |
| AC-007.86 | Actual Playwright validation supports frame locator composition. | PASS | Python companion measures a frame locator. |
| AC-007.87 | Actual Playwright validation supports nested frame paths. | NOT VERIFIED | Recursive companion resolution is implemented. Actual companion evidence for two nested frame transitions is unverified. |
| AC-007.88 | Frame owner failures are reported at the correct path segment. | FAIL | Companion reports failed resolution and owner count, but omits the exact failing path segment. |
| AC-007.89 | Child validation does not proceed through an ambiguous parent frame. | PASS | Owner count checked before constructing the frame candidate. |
| AC-007.90 | Actual Playwright validation supports native open shadow root locators. | PASS | Actual Python target within the open root. |
| AC-007.91 | Actual Playwright validation supports shadow host-scoped locators. | PASS | Actual Python host-chain target evidence. |
| AC-007.92 | Actual Playwright validation supports mixed frame and shadow DOM paths. | PASS | Mixed Python and unpacked companion cases. |
| AC-007.93 | Target identity is distinguished from locator uniqueness. | PASS | Wrong-frame marker absence is separate from match count. |
| AC-007.94 | Context changes invalidate relevant validation evidence. | PASS | Authorized child mutation makes evidence historical in Chromium. |
| AC-007.95 | Stale context validation results are rejected. | PASS | Both release checks guard evidence publication. |
| AC-007.96 | Unrelated contexts are not unnecessarily invalidated where reliable dependency information exists. | FAIL | Lifecycle invalidation conservatively covers related and unrelated evidence. |
| AC-007.97 | Manual locator overrides remain preserved. | NOT VERIFIED | Rows preserve manual choice on reference refresh. A scoped manual choice across context replacement needs a dedicated check. |
| AC-007.98 | The extension remains functional without the optional runtime validator. | PASS | Discovery, inspection and export tests run without pairing. |
| AC-007.99 | The side panel displays frame and shadow host hierarchies. | PASS | Panel displays path labels and scope summaries. |
| AC-007.100 | Users can filter discovered elements by context. | PASS | Context selector filters rows. |
| AC-007.101 | Users can scan specific accessible contexts. | PASS | Structured selected-path scan for same-origin and open-root contexts. |
| AC-007.102 | Users can scan all accessible contexts. | FAIL | Same-origin contexts are scanned together. Authorized cross-origin origins require separate actions. |
| AC-007.103 | Inaccessible contexts have actionable status information. | PASS | Unavailable state and optional action in the browsing-context panel. |
| AC-007.104 | Context-specific validation results are displayed. | PASS | Locator controls show companion evidence on scoped rows. |
| AC-007.105 | Cross-context messages include appropriate identity information. | PASS | Context paths, document-scoped Chrome routing and single-use nonce. |
| AC-007.106 | Message sender metadata is validated. | PASS | Extension sender and DOM event origin checks. |
| AC-007.107 | Stale or malformed context messages are rejected. | PASS | Typed path validation and stale transport guards. |
| AC-007.108 | Context registry recovery after service worker restart is supported. | NOT VERIFIED | Panel and content own state independently of the worker. Worker suspension was not forced. |
| AC-007.109 | User-defined model configurations survive context changes. | PASS | Live replacement preserves edited rows. |
| AC-007.110 | Generated Python uses supported native frame locator APIs. | PASS | Python .content_frame is executed. |
| AC-007.111 | Generated nested frame locator paths are valid. | PASS | Nested generated frame path unit assertion. |
| AC-007.112 | Generated shadow DOM locators use supported Playwright semantics. | PASS | Actual Playwright shadow target execution. |
| AC-007.113 | Generated context-aware components use reusable definitions. | PASS | Reusable generated CheckoutWidget contains a frame-relative member. |
| AC-007.114 | Generated Python preserves lazy locator resolution. | PASS | Generated locators are lazy. |
| AC-007.115 | Generated Python passes syntax validation. | PASS | Generated Python compiles by executing it. |
| AC-007.116 | Generated context-aware Python executes against representative fixtures. | PASS | Browser fixture code runs with Python Playwright. |
| AC-007.117 | Generated multi-file packages import successfully. | NOT VERIFIED | Existing generated packages import. A mixed context package execution test remains pending. |
| AC-007.118 | JSON exports preserve persistent context paths. | PASS | Schema-v3 context path export checked by test. |
| AC-007.119 | Transient browser context references are not serialized. | PASS | Schema-v3 export removes live document and reference fields. |
| AC-007.120 | Required model schema migrations are documented and tested. | PASS | ADR and schema-v3 tests. |
| AC-007.121 | Existing flat page and component models remain supported or have an explicit migration path. | PASS | Legacy generator and export tests pass. |
| AC-007.122 | Frame discovery concurrency is bounded. | PASS | Authorized scan is serial and capped at 12 direct child documents. |
| AC-007.123 | Shadow root traversal and observation are bounded. | PASS | In-browser benchmark confirms the 64-context bound. |
| AC-007.124 | Multi-context discovery performance is measured. | PASS | Measured 0, 10 and 50 frames and 100 hosts. |
| AC-007.125 | Context-local changes do not unnecessarily trigger full-tab rescans. | PASS | Same-context mutation batches refresh dirty subtrees. Context membership changes resynchronize. |
| AC-007.126 | Repeated context activation does not accumulate duplicate observers. | NOT VERIFIED | One observer and a replaced event-controller set are enforced in code. Repeated context activation soak remains open. |
| AC-007.127 | Removed frame and shadow root references are released appropriately. | NOT VERIFIED | Weak references and rebuilt observer sets are used. Memory retention measurements are pending. |
| AC-007.128 | Sensitive application values are not collected or persisted. | PASS | Synthetic scoped input value excluded from JSON. |
| AC-007.129 | Browser security boundaries are respected. | PASS | No cross-origin parent DOM access or closed-root bypass. |
| AC-007.130 | No arbitrary executable locator expressions are accepted. | PASS | Structured operation allowlist on both sides. |
| AC-007.131 | No unjustified extension permissions or external services are introduced. | PASS | Optional navigation metadata permission is restricted by use to an explicit tab and origin action. |
| AC-007.132 | The production side panel renders when contexts are inaccessible. | PASS | Sandbox fixture leaves the panel usable. |
| AC-007.133 | Optional subsystem failures do not produce a blank side panel. | PASS | Startup guard and unpaired fixture cases. |
| AC-007.134 | Automated tests cover browsing context models. | PASS | Context composition and serialized model unit tests. |
| AC-007.135 | Automated tests cover frame lifecycle behavior. | PASS | Dynamic frame insertion, navigation and removal Chromium case. |
| AC-007.136 | Automated tests cover shadow DOM discovery. | PASS | Mixed context Chromium fixture. |
| AC-007.137 | Automated tests cover cross-context messaging. | PASS | Authorized Chromium handshake and dual-lease runtime cases. |
| AC-007.138 | Actual browser tests cover same-origin and authorized cross-origin frames. | PASS | Same-origin and authorized cross-origin Chromium cases. |
| AC-007.139 | Actual browser tests cover open shadow DOM inspection. | PASS | Unpacked inspector selects a shadow control. |
| AC-007.140 | Actual Playwright tests cover mixed context locator semantics. | PASS | Actual Python companion exercise and generated Python. |
| AC-007.141 | Automated tests cover generated context-aware component execution. | PASS | Generated reusable frame component executed. |
| AC-007.142 | Existing TypeScript tests continue to pass. | PASS | 44 TypeScript tests passed. |
| AC-007.143 | Existing Python tests continue to pass where applicable. | PASS | 18 Python tests passed. |
| AC-007.144 | Existing POM-002 through POM-006 functionality remains operational. | PASS | Full existing unit, Chromium and companion suites. |
| AC-007.145 | DEF-001 regression tests continue to pass. | PASS | Existing production side-panel startup regression. |
| AC-007.146 | The production browser extension builds successfully. | PASS | TypeScript and production browser build. |
| AC-007.147 | GitHub Actions workflows remain functional. | PASS | [Hosted suite passed on implementation commit ba250c3](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46108161791). |
| AC-007.148 | Documentation accurately reflects implementation capabilities and limitations. | PASS | ADR, report, README and roadmap. |
