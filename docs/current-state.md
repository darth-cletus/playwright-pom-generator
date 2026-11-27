# Current state

POM-003 targets v0.3.0. POM-002's implementation checks and hosted CI passed. Installed Chrome and Edge release acceptance remains pending.

- The side panel still scans pages, ranks structured candidates, highlights controls, and exports Python and JSON. The inspector adds semantic and exact picks, hover feedback, hierarchical navigation, and an integrated collection.
- Scanned and inspected elements share locator candidates and a serializable model. Names, selection, ordering, and manual choices survive updates to the same live node. Detached nodes surface as stale.
- The existing extension permissions cover the inspector. Port ownership and transient overlays keep inspector state in the panel and content script.
- The automated browser suite loads the unpacked build in an isolated Chromium profile and pregrants the loopback fixture host. Local verification passed 25 unit and 18 browser tests, including Python syntax and execution checks. Hosted CI collects screenshots of the synthetic fixture. Native toolbar, permission prompt, and Edge release checks are manual.

Next milestone is POM-004 runtime validation. The locator records already distinguish browser approximation and Playwright evidence. Explicit container selection also supplies a foundation for POM-005 without inferring reusable components.

See [architecture](architecture.md) for constraints and [acceptance](acceptance-criteria.md) for verification.
