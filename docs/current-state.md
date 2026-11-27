# Current state

POM-002 targets v0.2.0. Formal release acceptance is pending.

- The existing side panel, element selection and renaming, highlighting, and Python and JSON exports use the new structured locator engine.
- The engine proposes semantic and CSS alternatives and ranks them using the evidence from one scan. Users can inspect the recommendation, override it, restore it, and persist test ID settings locally.
- The toolbar and optional per-site access flows remain in use. The `storage` permission saves locator preferences. Scanned page models stay in memory until locally exported.
- Push CI installs locked Node dependencies, runs unit tests, type-checks and builds the extension, and runs Chromium integration tests and generated Python validation. The feature branch passed all steps. [GitHub Actions run](https://github.com/darth-cletus/playwright-pom-generator/actions/runs/46052250012)
- An actual Playwright comparison runs against fixtures in tests. Extension scans use DOM validation and semantic approximation.

See the [acceptance checklist](acceptance-criteria.md) for browser release checks and [architecture](architecture.md) for validation limits.
