# Resolve declarative profiles before rendering Python

The existing synchronous generator already shares locator expressions and component validation between single-file and package exports. POM-009 keeps that path and adds a versioned, validated profile. Effective options apply built-in defaults, the chosen profile, and the page model's optional generation overrides in that order. Explicit configured methods reference selected element IDs and never infer business actions.

The renderer builds on typed locator and component models. It separates declaration, operation and artifact formatting helpers. Converting generated synchronous Python into async text after the fact would risk awaiting locator factories and missing asynchronous counts and assertions. Execution mode is chosen when emitting each operation. Constructors, properties and locator-based component factories remain synchronous. [Playwright Python execution modes](https://playwright.dev/python/docs/library)

A restricted template renders header comments from the class and profile name. Full-program template engines would need a larger DSL and execution boundary. Comment-only expansion uses a fixed token allowlist, plain text, and bounded input. The formatter applies indentation and newline conventions directly and requires no external command.

Python source analysis stays static and offers a user-reviewed draft from an explicit Playwright import and observed line endings. Base class modules, initialization arguments and dependencies remain user-configured contracts. Exports and previews use the same generation functions. Single-file output, packages and SHA-256 manifests require no companion. The existing protocol v1 companion can parse an individual preview and returns syntax evidence without importing framework dependencies.

Recorded actions in POM-010 can lower into the configured method model after user review. POM-011 test generation can reuse profile validation, shared locator expressions and deterministic artifact boundaries.
