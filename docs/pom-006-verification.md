# POM-006 verification

Extension v0.6.0 adds opt-in discovery on dynamic Chromium pages. The implementation is ready for review. Full POM-006 and installed-browser release acceptance remain open, as shown in the matrix.

## Architecture and files

- `src/content/lifecycle.ts` manages document and navigation identity, classifies changes and shares a single observer between browser discovery and Playwright evidence. `src/content/live-discovery.ts` scopes discovery to changed subtrees and tracked elements, samples accepted collections and reports overflow through full synchronization.
- `src/content/elements.ts` maintains weak live references and detects changes in declared business identity. `src/core/lifecycle.ts` reconciles those references with a persistent editable row and rejects stale or out-of-order messages. `src/sidepanel/live.ts` handles the session, recovery and tab selection.
- `src/content/runtime-correlation.ts` accepts Playwright evidence only for a matching lifecycle revision and correlation marker. The panel invalidates evidence and aborts an in-flight request when a relevant application change is observed. The companion stays at v0.5.0 and protocol v1.
- `src/core/model.ts` and `src/core/python.ts` handle live model export and lazy locator generation. `fixtures/dynamic.html`, `tests/lifecycle.test.ts` and `tests/browser/inspector.browser.ts` exercise reconciliation, delayed rendering, navigation, external labels, ambiguity, recycling and timing.
- The [architecture decision](decisions/0003-live-application-lifecycle.md) records observer budgets, ownership and compatibility.

## Implementation status

| Tasks | Status and evidence |
| --- | --- |
| .01–.06 | Unified lifecycle, separate identities, browser events, mutation classification and batching implemented. Native BFCache restoration coverage remains incomplete. |
| .07–.08 | Subtree discovery, direct external labels and tracked candidate refresh implemented. General locator dependency indexing and cross-subtree invalidation for untracked rows remain open. |
| .09–.11 | Weak live identity, declared-key recycling, conservative replacement and preservation tested. |
| .12–.15 | Accepted component definitions survive instance detachment. Scoped proposals and collection samples implemented. Automatic instance reconciliation and dataset-wide identity verification remain open. |
| .16–.19 | Delayed content, readiness, native dialogs and relevant visibility changes implemented. CSS rules driven externally by viewport, stylesheets or media queries may require a rescan. |
| .20 | Inspector remains integrated with the same element collection and stops on route transitions. |
| .21–.23 | Revision-bound evidence, manual targeted validation and opt-in revalidation of changed selected rows implemented. Automatic component revalidation and complete health history remain open. |
| .24–.26 | Path, state label, selected refresh, controls and pause/resume implemented. Multiple named snapshots and a dedicated replacement review workflow remain open. |
| .27–.28 | Versioned session, sequence checks, sync recovery and runtime cancellation implemented. |
| .29–.30 | Lazy Python generation and portable live JSON implemented. Unavailable component roots still require review before generation. |
| .31–.32 | Bounded observer workload and cleanup implemented. Dense interactive pages and long sessions require broader timing and resource verification. |
| .33–.34 | Existing extension permissions and safeguards retained. Basic panel diagnostics implemented. |
| .35–.36 | Added unit and browser coverage, fixture, architecture decision, docs and acceptance matrix. |

## Verification and demonstrations

The baseline passed 39 TypeScript tests, 23 Chromium tests and 17 Python companion tests. The implementation passed 42 TypeScript tests, 27 Chromium tests and 17 Python companion tests. Production bundling, TypeScript type checking and the configured Ruff checks passed. Chromium coverage includes the DEF-001 startup regression and actual Playwright integration. The hosted workflow passed on implementation commit `59d5113` and uploaded the fixture screenshots. [Hosted verification and screenshots](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46086141014)

Use `fixtures/dynamic.html` to inspect plan controls. The browser suite selects Dental plans, edits its Python name, and verifies that replacement retains both. It executes the exported Python against a new instance of the fixture after cloning the original button. It pauses while a portal inserts a quote action, then resumes and observes it. It exercises history push, replace, back and forward, query and hash changes, and a full reload. A second test changes an external label, recycles customer rows in a table advertising 250 records, opens and closes a dialog, and introduces an ambiguous test ID. The live component test reorders, duplicates and removes a plan card and examines rendered membership and unavailable instances. Existing companion coverage pairs the extension and rejects stale Playwright marker leases.

## Performance

The browser fixture surrounds a small number of interactive controls with inert nodes. Windows Chromium panel settlement after inserting one button compared with the next manual full rescan was 124/73 ms for 1,000 nodes, 135/68 ms for 10,000, and 284/195 ms for 50,000. Candidate option lists match the following full rescan. A 1,000-mutation burst on the 50,000-node page settled in 261 ms, with diagnostics recording the 256-record budget and one overflow-triggered rescan. Incremental timings include debounce. The shared candidate builder can still construct global semantic indexes. These cases showed no settlement latency improvement. A separate existing component benchmark detected one group across 100 cards in 12.5 ms and a 120-row table in 17.2 ms. Timing varies by runner.

The discovery budget is 48 roots, 256 records, and 1,500 discovered plus 200 tracked rows. The quiet period is 80 ms with a 240 ms scheduling deadline. The panel reports actual batch duration and full-scan count. Measurement of dense interactive pages, 100 distinct groups, heap growth and runtime request rates remains open.

## Security and privacy

The extension uses browser navigation events in its isolated world. Live updates carry the route pathname, bounded locator metadata and summary counts. Input values and raw mutation records are excluded. The observer ignores the extension's own overlays and correlation markers. Ports check extension sender and protocol version. The panel checks sequence and session identity. The Python companion receives only its existing structured protocol, with the application revision checked beside it inside the extension. Export strips transient references from live models, including component relationship references. No permissions or external services were added.

## Installed Chrome and Edge acceptance

1. Run `npm ci` and `npm run build`. Load `dist` as unpacked in Chrome or Edge. Run `python -m http.server 8000` from the repository and open `http://localhost:8000/fixtures/dynamic.html`.
2. Open the panel from the toolbar and enable live discovery. Check the active route, pause and resume, then run a full rescan. Verify the panel still starts when opened outside the extension context and shows the extension-API message.
3. Use DevTools with the fixture to call `dynamicFixture.replace()`, `dynamicFixture.delayed()`, `dynamicFixture.navigate()` and `dynamicFixture.replaceRoute()`. Verify edited selections survive and detached rows remain reviewable.
4. Call `dynamicFixture.recycle()`, `dynamicFixture.showDialog()`, `dynamicFixture.hideDialog()` and `dynamicFixture.duplicate()`. Compare rendered and declared membership, verify retired rows, and review the ambiguity change. Validate an affected locator with the companion after the change.
5. Create a high-frequency mutation burst in the local fixture, inspect live diagnostics, and compare incremental results with a full rescan. Repeat with the companion absent, during a browser reload, and after closing and reopening the panel.

## Limitations and follow-up

The extension works in the top frame and light DOM. Portals follow their actual DOM ancestry. Rendering or network-idle semantics beyond document readiness and `aria-busy` remain application-specific. Untracked global locator ambiguity and complex external accessible-name dependencies may need manual rescans. Rebinding requires a stable test ID within the same navigation. Virtualized totals rely on author-provided information. Evidence invalidation is conservative and may refresh more rows than the mutation affected.

An indexed locator dependency graph and live component instance reconciliation would improve dense pages and review workflows. Scope-aware document references can support POM-007 frames and shadow roots. Portable lifecycle metadata can support POM-008 reconciliation. Revisioned observations and cancellation can support POM-010 recording.

## Git

Implementation branch `feature/POM-006-dynamic-applications` is based on POM-005 at `38c3080`. The draft pull request targets the POM-005 branch. [Draft pull request #5](https://github.com/darth-cletus/playwright-pom-generator/pull/5)

## Acceptance criteria

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-006.01 | A unified application lifecycle architecture is implemented and documented. | PASS | Lifecycle and ADR |
| AC-006.02 | Document identity is distinguished from route identity. | PASS | Separate document and navigation counters |
| AC-006.03 | SPA pushState navigation is detected. | PASS | Unpacked pushState test |
| AC-006.04 | SPA replaceState navigation is detected. | PASS | Unpacked replaceState test |
| AC-006.05 | Browser back and forward navigation is detected. | PASS | Unpacked back and forward test |
| AC-006.06 | Hash-based navigation is detected. | PASS | Hash change triggers a new discovery scan in Chromium. |
| AC-006.07 | Relevant query parameter changes are detected. | PASS | Same-path query navigation triggers a new discovery scan in Chromium. |
| AC-006.08 | Full document navigation is handled correctly. | PASS | Reload reconnects in Chromium and preserves the edited model. |
| AC-006.09 | Duplicate navigation notifications are consolidated. | PASS | Navigation identity deduplication |
| AC-006.10 | Stale document messages are rejected. | PASS | Session, document and sequence guards |
| AC-006.11 | Document restoration and reinjection do not create duplicate lifecycle resources. | NOT VERIFIED | Lifecycle install and restoration guards implemented. BFCache resource accounting remains open. |
| AC-006.12 | Relevant DOM mutations are observed. | PASS | Dynamic browser fixtures |
| AC-006.13 | Mutation records are classified appropriately. | PASS | Lifecycle observer classification and browser regression |
| AC-006.14 | Mutation bursts are processed in bounded batches. | PASS | Record and root limits plus maximum wait |
| AC-006.15 | Irrelevant cosmetic mutations do not trigger unnecessary full scans. | NOT VERIFIED | Cosmetic style filtering implemented. Sustained cosmetic workload unmeasured. |
| AC-006.16 | Extension-generated DOM changes do not create discovery feedback loops. | PASS | Overlay and correlation-marker filtering |
| AC-006.17 | Newly added elements are discovered incrementally. | PASS | Delayed insertion and benchmark |
| AC-006.18 | Detached elements are removed from live discovery results. | PASS | Detached vision control and closed dialog |
| AC-006.19 | Modified element metadata is refreshed. | PASS | External label browser coverage |
| AC-006.20 | Affected locator candidates are refreshed or invalidated. | PASS | Selected locator browser coverage |
| AC-006.21 | External accessible-name dependencies are handled. | PASS | Direct aria-labelledby browser test |
| AC-006.22 | Newly introduced locator ambiguity is detected or conservatively invalidated. | FAIL | Global changes refresh selected rows only. Untracked ambiguous candidates can persist until rescan. |
| AC-006.23 | Incremental discovery converges to equivalent full-scan results in representative fixtures. | PASS | Browser benchmark compares the candidate option lists for incremental and full discovery. |
| AC-006.24 | A reliable full-rescan fallback is available. | PASS | Full-rescan benchmark and resume test |
| AC-006.25 | Live DOM identity is distinguished from persistent model identity. | PASS | Persistent model key and weak DOM reference |
| AC-006.26 | Detached selected elements are handled safely. | PASS | Unavailable selected customer test |
| AC-006.27 | Representative element replacement scenarios are detected. | PASS | Cloned plan control test |
| AC-006.28 | Confirmed replacement elements can be safely rebound. | PASS | Unique test-ID replacement test |
| AC-006.29 | Ambiguous replacement candidates require appropriate review. | PASS | Unmatched rows remain unavailable and new rows unselected |
| AC-006.30 | Recycled DOM nodes are not treated as permanently identical business entities. | PASS | Virtual row recycling browser test |
| AC-006.31 | User-defined element names survive rerendering. | PASS | Edited plan name browser test |
| AC-006.32 | Manual locator overrides survive rerendering. | PASS | Manual choice reconciliation unit test |
| AC-006.33 | Temporarily unavailable model elements are preserved. | PASS | Unavailable row unit test |
| AC-006.34 | Persistent model elements are not automatically deleted following DOM removal. | PASS | Unavailable row remains in browser and JSON tests |
| AC-006.35 | Newly added component instances are discovered. | NOT VERIFIED | Nearby structure proposals implemented. Accepted component membership addition is unverified. |
| AC-006.36 | Removed component instances are reflected in live state. | PASS | Chromium reports the removed card as unavailable. |
| AC-006.37 | Component definitions survive temporary instance removal. | PASS | Reconciliation retains definitions and instances |
| AC-006.38 | Component reordering preserves stable instance identification. | PASS | Chromium detects card reordering through retained references. |
| AC-006.39 | Component signature caches are invalidated appropriately. | PASS | Structure is rebuilt for affected containers |
| AC-006.40 | Relevant component discovery updates are incremental. | PASS | Scoped component discovery |
| AC-006.41 | Dynamic collection membership is tracked. | PASS | Rendered membership sampling through collection locator |
| AC-006.42 | Duplicate component identifiers are detected. | PASS | Duplicating a rendered card reports duplicate keys in Chromium. |
| AC-006.43 | Positional locator instability is reported where applicable. | FAIL | Existing locators warn about DOM order. Collection reordering does not propagate a persistent warning to each positional locator. |
| AC-006.44 | Virtualized collection support distinguishes rendered membership from total dataset size. | PASS | Rendered count and optional ARIA total implemented |
| AC-006.45 | Virtualized DOM node recycling is handled safely. | PASS | Virtual row recycling browser test |
| AC-006.46 | Non-rendered collection items are not falsely classified as absent from the dataset. | PASS | Collection reports rendered count and optional total |
| AC-006.47 | Asynchronously loaded elements are discovered. | PASS | Delayed portal button test |
| AC-006.48 | Application readiness is represented without indefinite waiting. | PASS | Readiness state is advisory and discovery starts immediately |
| AC-006.49 | Continuous cosmetic changes do not indefinitely prevent discovery updates. | NOT VERIFIED | Deadline exists. Sustained cosmetic workload unmeasured. |
| AC-006.50 | Dynamically appearing dialogs are discoverable. | PASS | Opening native dialog browser test |
| AC-006.51 | Dynamically removed dialogs are handled safely. | PASS | Closing native dialog browser test |
| AC-006.52 | Portal-rendered controls are not incorrectly assigned to DOM component scope. | PASS | Fixture uses actual portal DOM ancestry |
| AC-006.53 | Relevant visibility and element state changes are reflected or marked for refresh. | PASS | Dialog open and close refresh |
| AC-006.54 | Inspector behavior remains reliable during dynamic application changes. | PASS | Unpacked inspector regression suite |
| AC-006.55 | Stale highlights are removed or updated. | PASS | Unpacked inspector cleanup and replacement regressions |
| AC-006.56 | Validation evidence includes relevant application revision context. | PASS | RuntimeEvidence stores revision |
| AC-006.57 | Relevant application changes invalidate affected validation evidence. | PASS | Shared observer and marker lease invalidation |
| AC-006.58 | Historical validation results are not presented as current evidence. | PASS | Freshness controls and runtime regression suite |
| AC-006.59 | Targeted runtime revalidation is supported. | PASS | Per-locator and selected runtime controls |
| AC-006.60 | Runtime revalidation concurrency is bounded. | PASS | Runtime batches cancel and run sequentially |
| AC-006.61 | Stale asynchronous validation results are rejected. | PASS | Lease recheck and companion integration |
| AC-006.62 | Dynamically introduced ambiguity affects locator recommendations appropriately. | PASS | Selected test-ID ambiguity browser test |
| AC-006.63 | Manual locator overrides remain preserved. | PASS | Reconciliation unit test |
| AC-006.64 | The extension remains functional without the optional runtime validator. | PASS | Live browser tests run without the companion |
| AC-006.65 | Current route and discovery status are displayed. | PASS | Route and readiness browser test |
| AC-006.66 | Live discovery can be enabled and disabled. | PASS | Benchmark starts and stops each session |
| AC-006.67 | Live updates can be paused and resumed. | PASS | Pause and resume browser test |
| AC-006.68 | Users can request a full rescan. | PASS | Full-rescan benchmark |
| AC-006.69 | Users can review changed or unavailable model elements. | PASS | Unavailable row indicator |
| AC-006.70 | User editing operations survive incremental discovery updates. | PASS | Edited name and selection browser test |
| AC-006.71 | Incremental messaging avoids unnecessary complete-model transmission. | PASS | Upserts, removals and sequence are sent independently |
| AC-006.72 | Stale or duplicate messages are handled safely. | PASS | Duplicate and foreign update unit test |
| AC-006.73 | Full-state synchronization can recover from missed incremental updates. | PASS | Full-state gap recovery unit test |
| AC-006.74 | Service worker suspension and restart are handled appropriately. | NOT VERIFIED | Discovery port goes directly to content. Worker suspension was not exercised. |
| AC-006.75 | Existing flat page object generation remains functional. | PASS | Python generation regression suite |
| AC-006.76 | Existing reusable component generation remains functional. | PASS | Components regression and package execution |
| AC-006.77 | Generated locators continue to use lazy Playwright resolution. | PASS | Generator emits lazy Playwright locators |
| AC-006.78 | Generated Python executes successfully after representative application rerenders. | PASS | Exported Python executes against a replacement control with real Playwright. |
| AC-006.79 | Temporarily unavailable model elements are not silently excluded from generated code. | PASS | Unavailable narrow lazy export path or explicit review error |
| AC-006.80 | JSON exports preserve relevant persistent lifecycle metadata. | PASS | Live serialization unit test |
| AC-006.81 | Transient DOM references and pending runtime operations are not serialized. | PASS | Live serialization strips document and reference IDs |
| AC-006.82 | Required model schema migrations are documented and tested. | PASS | Additive schema coverage and ADR |
| AC-006.83 | Mutation queues and discovery workloads are bounded. | PASS | Observer limits and row budgets |
| AC-006.84 | Incremental discovery performance is measured. | PASS | 1k, 10k and 50k benchmark |
| AC-006.85 | Incremental discovery is compared with equivalent full-scan behavior. | PASS | Browser benchmark compares candidate options and records settlement for each approach. |
| AC-006.86 | Repeated lifecycle activation does not accumulate duplicate observers or listeners. | NOT VERIFIED | One observer per active document. Long-running live activation resource measurements remain open. |
| AC-006.87 | Detached DOM references are not retained unnecessarily. | PASS | Weak references and pruning |
| AC-006.88 | Discovery and validation cancellation release temporary resources. | PASS | Marker release and port-disconnect cleanup |
| AC-006.89 | Sensitive application values are not collected or persisted. | FAIL | Input values are excluded. Arbitrary site-specific secrets embedded in locator attributes or rendered text have no complete classifier. |
| AC-006.90 | Cross-context messages are validated. | PASS | Port sender, command and sequence checks |
| AC-006.91 | No unjustified extension permissions or external services are introduced. | PASS | Manifest change only increments version |
| AC-006.92 | The production side panel renders during dynamic application initialization. | PASS | Unpacked extension starts in the fixture |
| AC-006.93 | Optional subsystem failures do not produce a blank side panel. | PASS | DEF-001 startup guard regression and unpaired fixture |
| AC-006.94 | Automated tests cover navigation lifecycle behavior. | PASS | SPA push, replace, back and forward test |
| AC-006.95 | Automated tests cover mutation processing and incremental discovery. | PASS | Delayed, external label, ambiguity and benchmark tests |
| AC-006.96 | Automated tests cover dynamic element identity. | PASS | Replacement and recycling tests |
| AC-006.97 | Automated tests cover dynamic component lifecycle behavior. | PASS | Live component Chromium test covers reordering, duplicate keys and removal. |
| AC-006.98 | Actual browser tests cover representative SPA scenarios. | PASS | Unpacked Chromium tests |
| AC-006.99 | Actual Playwright tests cover dynamic locator behavior. | PASS | Companion and runtime Chromium suites |
| AC-006.100 | Existing TypeScript tests continue to pass. | PASS | 42 TypeScript tests pass |
| AC-006.101 | Existing Python tests continue to pass where applicable. | PASS | 17 Python companion tests pass |
| AC-006.102 | Existing POM-002 through POM-005 capabilities remain operational. | PASS | Existing TypeScript, Chromium and Python suites |
| AC-006.103 | DEF-001 regression tests continue to pass. | PASS | Startup guard and extension startup browser tests |
| AC-006.104 | The production browser extension builds successfully. | PASS | Production build passes |
| AC-006.105 | GitHub Actions workflows remain functional. | PASS | [Hosted verification for implementation commit 59d5113](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46086141014) |
| AC-006.106 | Documentation accurately reflects the implementation and limitations. | PASS | Docs and decision record include limits |
