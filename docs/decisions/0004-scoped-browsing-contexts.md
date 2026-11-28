# Model browsing scopes as explicit owner paths

POM-007 uses an ordered list of frame and shadow boundaries. A persistent boundary stores a structured locator for a unique owner. Runtime references, browser document IDs and content collection keys stay in the extension session. Scoped JSON uses schema v3. Existing flat and schema-v2 component data can still generate Python.

Same-origin scopes use browser DOM references. Open shadow trees are traversed through `shadowRoot`. Its absence provides no evidence of whether a closed root exists. Composition distinguishes iframe entry from descendant matching. Python emits a lazy `Locator.content_frame` for an iframe and native Playwright descendant locators inside open roots. Owner candidates require a unique match, including when `src` is shared. [Playwright locator API](https://playwright.dev/python/docs/api/class-locator)

An explicit action grants host access plus the optional `webNavigation` permission when scanning a reported cross-origin host. The panel uses the active tab's frame metadata and injects only into matching direct-child document IDs. A one-shot nonce, expected origin and sender window establish the DOM owner in the parent document. No privileged request payload travels through the page channel. Opaque or unresolved contexts stay unavailable. [Chrome frame metadata API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)

One content observer manages accessible roots and invalidates leases on relevant changes. Authorized cross-origin evidence uses separate top and child leases with a shared correlation marker. The panel accepts a result only if both release checks pass. The companion uses a structured allowlist, verifies each frame owner and returns evidence to the paired extension over protocol v1.

The implementation caps path depth at four, primary traversal at 64 discovered contexts and authorized discovery at 12 direct child documents per action. This leaves nested cross-origin authorization, browser-native prompts and high-cardinality benchmark coverage for follow-up.
