# ADR 0002 Reusable component scopes

POM-005 uses explicit definitions, representative instances, and optional collections in the existing page model. The extractor treats repeated structures as proposals. The user reviews and accepts a proposal before it affects generated output. A manual root can represent a single instance or be extended with additional live roots.

Structure grouping compares sibling boundary families and bounded sets of tag, role, input kind, and relative slot paths. It ignores instance text and IDs when scoring similarity. This enables repeated cards with different titles to share a definition. Captured names are used separately for verified heading lookup. Similar structure remains evidence for review because unrelated widgets can still share markup.

A component root and its member locator use the same structured locator vocabulary as flat pages. The scoped browser matcher excludes elements outside the root. The Python companion checks a unique parent and verifies it against a dedicated marker before evaluating a marked child. Collections report their intentional multi-match count separately. Locator chains, containment filters, text filters, and explicit indexes are allowlisted. Component relationships are checked for missing definitions, cycles, and depth.

The generator uses one rendering path for flat elements, component members, and package modules. It emits synchronous Playwright classes with lazy `Locator` attributes and uses composition for nested roots. Collection factories bind string parameters to native exact-role queries. A store-only ZIP bundles deterministic module paths and initialization files through the browser download API. [Playwright Locator API](https://playwright.dev/python/docs/api/class-locator)
