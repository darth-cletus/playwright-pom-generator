# ADR 0001 Local Playwright companion

Status accepted for POM-004.

| Approach | Runtime and page access | Security, setup, and portability |
| --- | --- | --- |
| Local Python HTTP companion and CDP | Executes Python Playwright in an explicitly configured Chromium browser. A short-lived marker correlates the document and target. | One venv and a dedicated Chromium profile. Loopback and exact extension pairing are portable across Windows, Linux, and macOS. CDP has lower fidelity than the Playwright protocol. |
| Native messaging | Can run Python and still needs a browser connection. | Browser-managed origin binding is useful. Windows registry or platform-specific manifest installation and the `nativeMessaging` permission complicate distribution. |
| Extension debugger | Can identify Chrome targets. Requires a bridge to execute Python Playwright. | Requires the privileged `debugger` permission and attaches a browser debugger directly to tabs. |
| Independent Playwright-managed browser | Full Playwright fidelity, straightforward CI, and a separate session with different live state. | A second production browser complicates authentication, identity, and lifecycle. Useful for isolated tests. |

Choose the local companion. Attach over CDP to an externally managed Chromium profile. The user launches the browser, approves an extension ID and pairing secret, and navigates to the application. The service connects only to an operator-configured loopback port. Closing the companion drops its transport and leaves the browser open.

Chrome 136 and later ignore remote debugging switches for the default Chrome data directory. Use an isolated profile or compatible Chrome for Testing and follow enterprise restrictions. Users can sign in manually in the isolated profile when authorized. [Chrome remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port) · [Playwright CDP API](https://playwright.dev/python/docs/api/class-browsertype#browser-type-connect-over-cdp) · [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) · [Chrome debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
