# Share a document lifecycle across live discovery and validation

POM-006 adds an opt-in session for top-frame Chromium applications. The content script owns the document key, navigation counter, mutation revision, and live node references. The side panel owns edits and receives typed updates over a document-scoped Chrome port. The service worker opens the side panel. The Python companion retains protocol v1.

Browser navigation events advance the navigation counter. Location and Navigation API entry identity consolidate duplicate notifications and distinguish visits to the same path. The stored route is the pathname. Query and fragment changes contribute to the in-memory navigation identity without disclosing their values in live updates. Page restoration refreshes discovery.

A shared observer classifies DOM changes for both discovery and validation. Discovery coalesces changes for 80 ms with a 240 ms deadline and evaluates at most 48 dirty roots or 256 mutation records per batch. Structural changes can suggest components from up to three nearby containers. Dirty controls, direct accessible-name dependencies, and up to 200 explicitly tracked references are refreshed. Candidate validation may still build a global semantic index. An overflow can trigger a bounded full rescan.

The editable model preserves source rows after detachment. Rebinding requires a stable, uniquely matched test ID and agreement on tag, label and scope within the same navigation. The content script uses weak DOM references and checks declared row identity when a virtualizer reuses nodes. Collection diagnostics count rendered objects and report a total only when the DOM advertises one.

Runtime Playwright evidence records the originating application revision. A lease checks that revision again before releasing. Mutation records, timers and marker values have a document-local lifetime. Browser-policy Python generation can keep a previously unique stable test ID for a temporarily unavailable element. Locators resolve lazily when the generated methods run.

The discovery port uses protocol v1 independently of the companion. Lifecycle fields are additive to the existing page model. Live exports preserve the editable model, availability and route label, and strip session references. Existing static exports retain their prior format.
