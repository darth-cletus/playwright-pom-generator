# Locator engine architecture

The content script orchestrates a scan of the top-level document. Discovery covers the existing native controls and content-editable elements, plus additional interactive ARIA roles such as switches, tabs, and menu items. Static headings, images, dialogs, and tables are available for role analysis and validation. The scan still focuses on interactive controls.

1. `src/content/accessibility.ts` uses `dom-accessibility-api` for accessible names, implicit role defaults, and accessibility-tree visibility. It handles fallback ARIA roles, input list context, and table header/cell context. Native DOM label associations and ARIA references provide separate label candidates.
2. `src/content/metadata.ts` derives the display label and interaction type. `src/content/candidates.ts` proposes native Playwright strategies and CSS selectors. Canonical strategy and argument keys remove duplicates. A full DOM-order CSS path is added only when other proposals have no unique target match.
3. `src/content/validation.ts` resolves candidates against a scan-local DOM snapshot and caches query results and semantic indexes. The validator takes a structured locator and its intended element. A future validator can supply evidence with the `playwright` method.
4. `src/core/scoring.ts` applies deterministic reliability heuristics. `src/core/python.ts` serializes approved locator arguments into Python calls. The JSON export retains structured data and the chosen candidate ID. The browser never evaluates generated Python.

## Candidate model and ranking

Each candidate has a canonical ID, a discriminated strategy with literal arguments, a basis, a score, explanations, warnings, and validation evidence. Evidence records the method, status, and when available the count and whether the target is among the matches. Current locators are scoped to the scanned document.

Default base scores are 100 for the configured test ID, 95 for alternative test attributes, role and name, or associated labels, 85 for stable IDs, 80 for placeholder or alt text, 75 for title or exact text, 70 for name, 65 for CSS combinations, 40 for classes, 35 for potentially dynamic values, and 5 for structural CSS. The score is a heuristic on a 0–100 scale. The scorer adjusts for configured test attribute priority, instability, selector complexity, long text, validation confidence, and match evidence. Warnings identify structural dependencies and text that may vary by language. Validation status ranks first, then score, then canonical ID. Only a unique target match is eligible for automatic selection or Python generation.

UUIDs, framework-generated IDs, build hashes, CSS-in-JS patterns, and long opaque identifiers earn stability warnings and lower scores. Numbers alone are insufficient evidence. Manual choice is stored as `choice`; `null` means automatic. Version 0.1.0 JSON stored Python expressions and numeric indices. Version 0.2.0 exports structured locators and candidate IDs. The extension has no model import flow.

## Locator strategies and test IDs

The generator supports `get_by_test_id`, `get_by_role` with an exact accessible name, `get_by_label`, `get_by_placeholder`, `get_by_text`, `get_by_alt_text`, `get_by_title`, and CSS `locator`. Strings are escaped as Python literals.

Default recognized attributes are `data-testid`, `data-test-id`, `data-test`, `data-qa`, `data-cy`, and `data-automation-id`. Settings store the priority order and the attribute the user's Playwright project has configured. Only that attribute produces a native test ID call. Generated Python includes a configuration reminder if it uses a nondefault attribute. Preferences are stored in `chrome.storage.local`.

## Validation and privacy

- **Exact DOM CSS** uses `querySelectorAll` in the scanned document.
- **Browser approximation** uses locally indexed roles, names, labels, and exact strings. Test ID matching uses a DOM attribute lookup and assumes the chosen Playwright configuration.
- **Playwright runtime** is reserved for evidence produced by a real Playwright runner. Integration tests compare fixture candidates to actual locators and exercise generated Python. The installed extension uses the first two mechanisms.
- **Unvalidated** describes candidates for which match evidence is unavailable. The result model also distinguishes unique target, ambiguous, no match, wrong target, and validation error.

Browser estimates can differ from Playwright for browser-specific accessibility behavior, deeply nested text, hidden references, malformed ARIA, pseudo-element text, and Playwright's handling of shadow DOM and frames. Locator evidence is a scan-time snapshot. The scanner omits text from editable areas and skips accessible-name sources that can derive from live embedded control values. Author-provided text and attributes can still contain sensitive data. It does not transmit page data or persist it to extension storage.
