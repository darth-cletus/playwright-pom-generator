# POM-008 verification

The v0.8.0 extension and companion provide a review workflow for existing page objects. The implementation is ready for draft review. Full acceptance remains open.

## Architecture and capabilities

- `companion/src/pom_validator/source.py` parses caller-provided UTF-8 Python text, identifies class and locator expression spans, and creates revision-checked edits and unified diffs using the standard library.
- `src/core/review.ts` validates imported JSON models and companion analysis responses. It assesses existing locators and proposes a replacement only when one observed field name matches and the existing engine has a unique candidate.
- `src/sidepanel/review.tsx` holds selected files and approvals in memory. Users can inspect diagnostics, choose the current source, review differences and download updated Python, original Python, patches, and schema-v1 review reports.
- The content script validates structured locator batches in the scanned document. The paired companion also checks imported locators with Playwright. Imported evidence uses unverified target identity. Navigation, active tab or model changes clear relevant panel evidence.
- The [architecture decision](decisions/0005-static-source-review.md) explains parsing, byte spans and contract compatibility.

## Implementation status

| Tasks | Status |
| --- | --- |
| .01–.06 | Static source design, bounded file selection, JSON versions through v3, and top-level class discovery implemented. Packages and archive import remain open. |
| .07–.14 | Literal locator calls, chains, frame paths and simple module constants are supported. Review shows declared base names and shared constant references. Inheritance resolution, cross-file dependency analysis, filters, parameterized definitions and properties remain open. |
| .15–.18 | File and line provenance, original source retention, revision hashes and explicit active-tab checks implemented. Persistent project-to-route binding remains open. |
| .19–.26 | Browser and Playwright cardinality checks and conservative replacement candidates implemented. Confirmed imported identity, dependency-impact analysis and an application-change inventory remain open. |
| .27–.35 | Individual approval, diff preview, original download, non-destructive replacement and revision conflicts implemented. Insertion, shared constant edits, project-wide transformations and three-way rebasing remain open. |
| .36–.43 | Session originals, discard preview, review report and Git-compatible per-file patches implemented. Durable revision history and repository integration remain open. |
| .44–.49 | Local static endpoints, structured validation, bounded input, evidence clearing and timing fixture implemented. Cancellation of in-flight parsing and resource soak testing remain open. |
| .50–.51 | Added unit, Python, source-preservation, patch, and actual Chromium workflow coverage, plus project documentation and a criterion matrix. |

## Supported source and representative change

Top-level classes are listed. Direct constructor assignments to `self.attribute` can use a `page` argument or `self.page`, literal CSS, test IDs, exact semantic selectors, descendant chains and iframe transitions. Simple unrepeated uppercase module string constants can be read. Expressions containing comments are read-only because replacing the complete expression would remove those comments. The review preserves application-specific methods and surrounding source.

```diff
--- a/login.py
+++ b/login.py
@@ -1,3 +1,3 @@
 class Login:
     def __init__(self, page):
-        self.email_input = page.locator('#old-email')  # preserve
+        self.email_input = page.get_by_test_id('email')  # preserve
```

The trusted transformed fixture executes through Python Playwright. The no-edit case preserves UTF-8 bytes, CRLF and the absence of a final newline. The test checks the generated patch with `git apply --check`.

## Verification and performance

The POM-007 baseline passed 44 TypeScript, 32 Chromium and 18 companion tests. POM-008 adds two TypeScript and four Python tests, and extends the unpacked-browser runtime scenario to analyze an imported Python file, check its locator in Playwright, approve a replacement and preview the resulting diff.

On the local Windows runner, static analysis of 250 assignments took 5.8 ms and preparing 25 changes took 12.1 ms. These measurements exclude file selection, HTTP transport and live locator checks. File selection is capped at ten Python files of 64 KiB each. The service enforces its existing HTTP body limit and bounds source AST depth and node count. Memory growth, concurrent soak and project-scale performance remain unmeasured.

## Local security

The extension reads only selected files. Python operations use the existing paired loopback service with exact origin, host and token checks. Analysis uses AST and tokenization and never imports or runs user code. Paths are accepted only as validated basenames for diff headers. Diagnostics use fixed messages and line numbers. Files and reports remain local. The manifest permission list is unchanged.

## Manual acceptance

1. Load the built extension and open a scanned test page. In **Manage existing page objects**, import a known JSON export and verify that it reopens without a companion.
2. Pair the v0.8.0 companion and import a Python page object. Review supported expressions and diagnostics. Check imported locators with both browser matching and Playwright.
3. Approve one replacement. Select a modified version of the original to verify the revision conflict, then select the original to preview a patch. Confirm only the approved expression changed. Download and check the patch in a disposable Git worktree.
4. Repeat with a commented or dynamic expression and confirm it is preserved. Discard the preview and download the original.

## Limitations

File groups use separate basenames. Archive import, relative project paths, cross-file edits, durable undo, structural insertions and dependency-aware repairs are outside this implementation. Browser recommendations are heuristic and use field names and browser uniqueness, so the workflow requires review. The workspace can report locator cardinality but cannot establish imported target identity without a known binding. Imported source is restricted to UTF-8 without a byte order mark.

## Git and compatibility

Branch `feature/POM-008-lifecycle-management` is stacked on POM-007. Extension and companion use v0.8.0. Transport remains protocol v1, the source operations use contract 1, and existing model schemas through v3 stay supported.

## Acceptance criteria

PASS records exercised or reviewed behavior. FAIL records an implementation gap. NOT VERIFIED records missing evidence.

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| AC-008.01 | Source parsing architecture is evaluated and documented. | PASS | ADR 0005 evaluates analysis and transformation approaches. |
| AC-008.02 | Imported artifacts integrate with the existing automation model. | PASS | Portable JSON model reader, schema checks and legacy generator path. |
| AC-008.03 | Individual Python files can be imported. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.04 | Multiple Python files can be imported. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.05 | Supported multi-file packages can be imported. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.06 | Relative source paths are preserved. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.07 | Previously exported JSON models can be imported. | PASS | Portable JSON model reader, schema checks and legacy generator path. |
| AC-008.08 | Required JSON schema migrations are tested. | PASS | Portable JSON model reader, schema checks and legacy generator path. |
| AC-008.09 | Invalid source files produce actionable diagnostics. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.10 | Invalid JSON models are rejected safely. | PASS | Portable JSON model reader, schema checks and legacy generator path. |
| AC-008.11 | Relevant page object classes are discovered. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.12 | Relevant reusable component classes are discovered. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.13 | Users can identify relevant classes manually. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.14 | Supported inheritance relationships are analyzed. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.15 | Supported cross-file dependencies are analyzed. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.16 | Unresolved dependencies are reported. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.17 | Standard Playwright locator assignments are extracted. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.18 | Semantic Playwright locators are extracted. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.19 | Supported locator chains are extracted. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.20 | Component-relative locators are extracted. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.21 | Supported frame locator paths are extracted. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.22 | Supported shadow host scopes are extracted. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.23 | Supported locator filters are extracted. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.24 | Supported locator constants are extracted. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.25 | Shared locator dependencies are identified. | PASS | Analysis records module string references and the panel counts supported uses. |
| AC-008.26 | Supported parameterized locators are extracted. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.27 | Supported locator-returning properties are analyzed. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.28 | Supported locator-returning methods are analyzed. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.29 | Synchronous source is recognized. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.30 | Asynchronous source is recognized. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.31 | Unsupported dynamic expressions are reported accurately. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.32 | Unsupported constructs remain preserved. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.33 | Extracted locators use the existing structured locator model. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.34 | Imported locators retain source provenance. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.35 | Source file revisions are tracked. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.36 | Original source content remains available. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.37 | No-change export preserves original source bytes. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.38 | Existing class names are preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.39 | Existing attribute names are preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.40 | Existing custom methods are preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.41 | Existing inheritance relationships are preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.42 | Existing comments and docstrings are preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.43 | Existing formatting is preserved outside approved changes. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.44 | Existing decorators and type annotations are preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.45 | Imported page objects can be associated with live applications. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.46 | Application associations can include route and state information. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.47 | Component scope associations are supported. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.48 | Frame context associations are supported. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.49 | Supported imported locators can be validated using actual Playwright. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.50 | Locator validation does not execute imported custom methods. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.51 | Unique confirmed targets are distinguished from unique unverified targets. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.52 | Missing locators are identified. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.53 | Ambiguous locators are identified. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.54 | Wrong-target locators are identified when reliable evidence exists. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.55 | Unsupported locators are not classified as confirmed broken. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.56 | Temporarily unavailable contexts are represented accurately. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.57 | Validation freshness is tracked. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.58 | Historical validation is not presented as current evidence. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.59 | Locator dependencies are represented. | PASS | Entry metadata and review reports retain module constant dependencies. |
| AC-008.60 | Parent locator failures identify affected dependent locators. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.61 | Shared selector changes include dependency impact. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.62 | Frame owner failures identify affected child locators. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.63 | Shadow host failures identify affected child locators. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.64 | Added application elements can be identified. | FAIL | A dedicated added/changed application inventory is pending. |
| AC-008.65 | Relevant changed application elements can be identified. | FAIL | A dedicated added/changed application inventory is pending. |
| AC-008.66 | Missing application elements are reported conservatively. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.67 | Dynamic application availability is considered. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.68 | Newly discovered automation opportunities are distinguished from repairs. | FAIL | A dedicated added/changed application inventory is pending. |
| AC-008.69 | Existing identity reconciliation is reused. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.70 | Replacement candidates are generated using the existing locator engine. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.71 | Replacement recommendations include supporting evidence. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.72 | Replacement recommendations include target identity information. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.73 | Replacement recommendations include relevant runtime validation. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.74 | Ambiguous replacement targets require review. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.75 | Parent locator repairs are considered before redundant child repairs. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.76 | Recommendation confidence is explainable. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.77 | Change risk is explainable. | FAIL | Explicit scan and cardinality are available. Durable context association, identity evidence and impact or risk analysis are pending. |
| AC-008.78 | Heuristic confidence is not presented as a calibrated probability. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.79 | User-defined locator overrides remain preserved. | PASS | Conservative browser evidence and one observed matching field. Candidate explanations remain in the current model. |
| AC-008.80 | Stale recommendations are identified. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.81 | Application changes invalidate relevant recommendation evidence. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.82 | Proposed changes use a structured change model. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.83 | Individual changes can be reviewed. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.84 | Individual changes can be approved. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.85 | Individual changes can be rejected. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.86 | Alternative locator candidates can be selected. | FAIL | The panel offers one candidate per source entry. |
| AC-008.87 | Dependent changes are identified. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.88 | Incompatible change combinations are rejected. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.89 | Proposed changes are not applied automatically. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.90 | Rejected changes are not transformed. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.91 | Source diffs accurately represent proposed transformations. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.92 | Source diffs distinguish approved and unapproved changes. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.93 | Supported locator expressions can be transformed safely. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.94 | Supported locator constants can be transformed safely. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.95 | Supported component root locators can be transformed safely. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.96 | Supported frame locator paths can be transformed safely. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.97 | Supported shadow host scopes can be transformed safely. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.98 | Supported parameterized locators retain their parameter semantics. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.99 | Custom methods remain unchanged during locator replacement. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.100 | Unrelated source code remains unchanged. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.101 | Unsupported transformations produce manual recommendations. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.102 | Approved new locator definitions can be inserted where safe. | FAIL | Source insertion and naming conflict review are unsupported. |
| AC-008.103 | Naming conflicts are detected. | FAIL | Source insertion and naming conflict review are unsupported. |
| AC-008.104 | Unsafe insertion locations are rejected. | FAIL | Source insertion and naming conflict review are unsupported. |
| AC-008.105 | Compatible multi-file changes can be transformed. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.106 | Transformed Python passes syntax validation. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.107 | Trusted transformed fixture page objects execute successfully. | PASS | Trusted transformed fixture executes with actual Python Playwright. |
| AC-008.108 | Existing synchronous or asynchronous execution style is preserved. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.109 | Source changes after import are detected. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.110 | Stale source revisions prevent unsafe transformation. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.111 | Overlapping source changes are detected. | NOT VERIFIED | The constructor subset produces disjoint spans. A dedicated malicious overlap test is pending. |
| AC-008.112 | Supported unrelated intervening changes can be preserved. | FAIL | No stored revision history or automatic rebase. The session keeps the original plus a working preview. |
| AC-008.113 | Conflicting locator modifications require review. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.114 | Model revision history is maintained. | FAIL | No stored revision history or automatic rebase. The session keeps the original plus a working preview. |
| AC-008.115 | Approved and rejected changes are recorded appropriately. | FAIL | No stored revision history or automatic rebase. The session keeps the original plus a working preview. |
| AC-008.116 | Internal working-copy transformations can be undone. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.117 | Original imported source remains recoverable. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.118 | Revision retention is bounded. | FAIL | No stored revision history or automatic rebase. The session keeps the original plus a working preview. |
| AC-008.119 | Page object health reports are available. | PASS | Schema-v1 report includes per-entry health, coverage, approval state and manual diagnostics. |
| AC-008.120 | Validation coverage is reported separately from locator health. | PASS | Schema-v1 report includes per-entry health, coverage, approval state and manual diagnostics. |
| AC-008.121 | Dependency-blocked locators are reported separately. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.122 | Locator quality and technical debt findings are available. | FAIL | The parser handles a bounded constructor subset. Component receiver classification, richer syntax and dependency-aware editing are pending. |
| AC-008.123 | Application change reports are available. | FAIL | A dedicated added/changed application inventory is pending. |
| AC-008.124 | Reconciliation reports include supporting evidence. | PASS | Schema-v1 report includes per-entry health, coverage, approval state and manual diagnostics. |
| AC-008.125 | Approved and rejected changes are included in reports. | PASS | Schema-v1 report includes per-entry health, coverage, approval state and manual diagnostics. |
| AC-008.126 | Unresolved constructs and conflicts are included in reports. | PASS | Schema-v1 report includes per-entry health, coverage, approval state and manual diagnostics. |
| AC-008.127 | Updated Python source can be exported. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.128 | Updated multi-file packages can be exported. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.129 | Valid unified diff patches can be exported. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.130 | Exported patches can be checked against trusted fixture repositories. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.131 | Updated JSON models can be exported. | PASS | Portable JSON model reader, schema checks and legacy generator path. |
| AC-008.132 | Machine-readable reconciliation reports can be exported. | PASS | Schema-v1 report includes per-entry health, coverage, approval state and manual diagnostics. |
| AC-008.133 | Original files are not overwritten by default. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.134 | Users can review imported classes and components. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.135 | Users can review import diagnostics. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.136 | Users can initiate imported locator validation. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.137 | Users can review locator health. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.138 | Users can review replacement candidates. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.139 | Users can review source diffs. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.140 | Users can review conflicts. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.141 | Users can export approved transformations. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.142 | Companion requirements are communicated accurately. | PASS | Companion dependency is explicit and JSON workspace is independent. |
| AC-008.143 | Existing standalone discovery and generation remain available without the companion. | PASS | Companion dependency is explicit and JSON workspace is independent. |
| AC-008.144 | Companion failures do not produce a blank side panel. | PASS | Companion dependency is explicit and JSON workspace is independent. |
| AC-008.145 | Imported Python code is never executed during static analysis. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.146 | Arbitrary imported modules are not dynamically loaded. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.147 | Arbitrary executable locator expressions are rejected. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.148 | Imported archives are protected against unsafe paths. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.149 | Import file and archive limits are enforced. | FAIL | Separate file groups only. Packages, archive import, relative paths and project-level dependency and transforms are unsupported. |
| AC-008.150 | Analysis duration and concurrency are bounded. | FAIL | Input, tree complexity and operation concurrency are bounded. A hard cancellation deadline inside the Python worker is unavailable. |
| AC-008.151 | Sensitive source values are excluded from unnecessary diagnostics. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.152 | Imported source is not transmitted to external services. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.153 | No unjustified extension permissions are introduced. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.154 | Users can clear imported artifacts and history. | PASS | Clear imported artifacts action resets the in-memory workspace. |
| AC-008.155 | Representative import performance is measured. | PASS | Measured 250 assignments and 25 edits in Python workload. |
| AC-008.156 | Representative transformation performance is measured. | PASS | Measured 250 assignments and 25 edits in Python workload. |
| AC-008.157 | Cancellation and resource cleanup are verified. | NOT VERIFIED | Artifact clearing is implemented. In-flight cancellation and cleanup need dedicated verification. |
| AC-008.158 | Automated tests cover supported source parsing. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.159 | Automated tests cover unsupported source constructs. | PASS | Static constructor analysis and line diagnostics. Supported syntax is documented. |
| AC-008.160 | Automated tests cover source preservation. | PASS | CRLF, Unicode, trailing comments and no-change source test. |
| AC-008.161 | Automated tests cover locator dependency analysis. | PASS | The static Python regression checks extracted module constant references. |
| AC-008.162 | Automated tests cover reconciliation recommendations. | PASS | TypeScript unit coverage for safe replacement selection. |
| AC-008.163 | Automated tests cover approval and rejection workflows. | PASS | Source review state, individual approval, rejected or discarded edits and diff preview. |
| AC-008.164 | Automated tests cover source transformation. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.165 | Automated tests cover source revision conflicts. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.166 | Automated tests cover patch generation. | PASS | Revision-bound byte-span transformation, original download and Python patch tests. |
| AC-008.167 | Automated tests cover malicious source import. | PASS | AST-only parse, structured contracts, loopback transport and security regression fixture. |
| AC-008.168 | Actual Playwright tests cover imported locator validation. | PASS | Explicit active scan, browser cardinality and local Playwright integration with unconfirmed identity. |
| AC-008.169 | Actual Playwright tests cover trusted transformed source execution. | PASS | Trusted transformed fixture executes with actual Python Playwright. |
| AC-008.170 | Actual browser tests cover representative lifecycle management workflows. | PASS | Real unpacked Chromium imports, validates and reviews a replacement. |
| AC-008.171 | Existing TypeScript tests continue to pass. | PASS | Local TypeScript, companion and Chromium suites, production build and persistent docs. |
| AC-008.172 | Existing Python tests continue to pass where applicable. | PASS | Local TypeScript, companion and Chromium suites, production build and persistent docs. |
| AC-008.173 | Existing POM-002 through POM-007 functionality remains operational. | PASS | Local TypeScript, companion and Chromium suites, production build and persistent docs. |
| AC-008.174 | DEF-001 regression tests continue to pass. | PASS | Local TypeScript, companion and Chromium suites, production build and persistent docs. |
| AC-008.175 | The production browser extension builds successfully. | PASS | Local TypeScript, companion and Chromium suites, production build and persistent docs. |
| AC-008.176 | GitHub Actions workflows remain functional. | NOT VERIFIED | Hosted workflow verification pending. |
| AC-008.177 | Documentation accurately reflects implementation capabilities and limitations. | PASS | Local TypeScript, companion and Chromium suites, production build and persistent docs. |
