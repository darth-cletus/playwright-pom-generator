# Playwright runtime validation companion

Extension and companion v0.4.0 use protocol v1. Use Python 3.11 or newer and a compatible Chromium browser.

## Windows PowerShell

Run from the repository root.

```powershell
npm.cmd ci
npm.cmd run build
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -c companion/constraints.txt -e '.\companion[dev]'
.\.venv\Scripts\python.exe -m pom_validator.cli token
```

Keep the generated token local. Launch Chrome with a separate profile. Adjust the executable location if needed.

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" "--user-data-dir=$env:LOCALAPPDATA\POM-Validation-Chrome" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
```

For Edge, use its `msedge.exe` executable and a different profile directory such as `POM-Validation-Edge`. Managed-browser policy can restrict debugging.

Load `dist` in that profile via `chrome://extensions` or `edge://extensions`. Copy the extension ID and start the service. Replace `YOUR_EXTENSION_ID` and paste the token at the terminal prompt.

```powershell
.\.venv\Scripts\pom-validator.exe serve --extension-id YOUR_EXTENSION_ID --port 8765 --debug-port 9222
```

Keep both ports on loopback. Treat the dedicated profile as privileged while debugging is enabled.

## Connect and validate

1. Expand **Playwright runtime validation** in the extension. Enter the port and token and choose **Pair with companion**. Approve access to the loopback address if prompted.
2. Choose **Connect browser**. Navigate to the application in that same profile and scan or pick an element.
3. Choose **Validate current locator**, **Validate all candidates**, or **Validate selected elements**. Review match count, target identity, optional state and trial checks, and the freshness label.
4. Choose **Disconnect browser** and press **Ctrl+C** in the service terminal when done. Close the debugging profile yourself.

Pairing is held in panel memory. After reopening the panel, enter the token again. If correlation fails, switch to and rescan the intended tab in the connected debugging profile. If the browser restarts, refresh its status and reconnect.

On Linux or macOS use `python3 -m venv .venv`, `.venv/bin/python`, and `.venv/bin/pom-validator`. Run the local browser executable with equivalent flags and a private profile directory. Edge and platform-specific launch instructions remain subject to manual acceptance.

## Tests

```powershell
npx.cmd playwright install chromium
.\.venv\Scripts\python.exe -m ruff check companion
.\.venv\Scripts\python.exe -m ruff format --check companion
.\.venv\Scripts\python.exe -m pytest companion -q -s
$env:POM_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

Linux CI uses `npx playwright install --with-deps chromium`. Tests launch isolated Chromium profiles and a temporary companion against synthetic fixtures.
