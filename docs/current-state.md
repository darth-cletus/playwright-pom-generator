# Current state

POM-004 targets v0.4.0. POM-002 is merged to main. POM-003 is merged into the stacked integration branch used as the POM-004 base. Both earlier milestones passed hosted automated checks. Installed Chrome and Edge release acceptance remains pending.

- The side panel still scans pages, ranks structured candidates, highlights controls, and exports Python and JSON. The inspector adds semantic and exact picks, hover feedback, hierarchical navigation, and an integrated collection.
- Scanned and inspected elements share locator candidates and a serializable model. Names, selection, ordering, and manual choices survive updates to the same live node. Detached nodes surface as stale.
- The existing extension permissions cover the inspector. Port ownership and transient overlays keep inspector state in the panel and content script.
- The automated browser suite loads the unpacked build in an isolated Chromium profile and pregrants the loopback fixture host. It exercises document and extension reloads, overlay geometry, exports, and Python syntax and execution. Hosted CI collects screenshots of the synthetic fixture. Native toolbar, permission prompt, and Edge release checks are manual.

POM-004 adds optional Python Playwright protocol v1. The companion authenticates requests on loopback, attaches to a dedicated Chromium profile, and correlates the inspected document and target using temporary markers. The browser-only workflow remains available. Local and hosted automation passed 31 unit, 20 Chromium, and 17 Python tests. Coverage uses two same-URL tabs and a real unpacked extension. The installed Chrome and Edge workflow on an authorized application remains a manual acceptance item. [Hosted run](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46077816340)

Next milestone is POM-005 reusable component discovery. The existing selected container and runtime evidence records provide a foundation for scoped locator validation and later locator health reporting.

See [architecture](architecture.md) for constraints and [acceptance](acceptance-criteria.md) for verification.
