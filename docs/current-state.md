# Current state

POM-008 targets v0.8.0. The side panel can open JSON models, review supported Python assignments, check imported locators and prepare revision-bound source diffs. [POM-008 verification](pom-008-verification.md)

POM-007 targets v0.7.0 for the extension and Python companion. Browsing contexts extend discovery, inspection, exports and runtime validation to supported frames and open shadow roots. See [verification](pom-007-verification.md) for browser coverage and acceptance gaps.

POM-006 targets v0.6.0 and builds on POM-005 and the committed DEF-001 startup guard. Live discovery streams page changes into the side panel, preserves edits across eligible replacements, and attaches application revisions to Playwright evidence. The Python companion remains on protocol v1. See [POM-006 verification](pom-006-verification.md) for local evidence and outstanding acceptance work.

- The side panel still scans pages, ranks structured candidates, highlights controls, and exports Python and JSON. The inspector adds semantic and exact picks, hover feedback, hierarchical navigation, and an integrated collection.
- Scanned and inspected elements share locator candidates and a serializable model. Names, selection, ordering, and manual choices survive updates to the same live node. Detached nodes surface as stale.
- The existing extension permissions cover the inspector. Port ownership and transient overlays keep inspector state in the panel and content script.
- The automated browser suite loads the unpacked build in an isolated Chromium profile and pregrants the loopback fixture host. It exercises document and extension reloads, overlay geometry, exports, and Python syntax and execution. Hosted CI collects screenshots of the synthetic fixture. Native toolbar, permission prompt, and Edge release checks are manual.

POM-004 adds optional Python Playwright protocol v1. The companion authenticates requests on loopback, attaches to a dedicated Chromium profile, and correlates the inspected document and target using temporary markers. The browser-only workflow remains available. Local and hosted automation passed 31 unit, 20 Chromium, and 17 Python tests. Coverage uses two same-URL tabs and a real unpacked extension. The installed Chrome and Edge workflow on an authorized application remains a manual acceptance item. [Hosted run](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46077816340)

POM-005 adds explicit reusable definitions, heuristic discovery, sampled scoped validation, nested relationships, and lazy Python package generation. The unpacked Chromium suite exercises three repeated cards, optional content, nested status components, and live scoped Playwright evidence. A detector benchmark covers 3, 20, and 100 cards and a 120-row table. JSON component models use schema v2 and the companion uses protocol v1.

See [architecture](architecture.md) for constraints and [acceptance](acceptance-criteria.md) for verification.
