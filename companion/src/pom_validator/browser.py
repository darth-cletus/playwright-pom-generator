import asyncio
import json
from uuid import uuid4

from playwright.async_api import Browser, Error, Page, Playwright, async_playwright

from .contracts import Correlation


class BrowserUnavailable(RuntimeError):
    pass


class PageUnavailable(RuntimeError):
    pass


async def debugger_url(port: int) -> str:
    """Resolve the approved local endpoint without proxies or redirects."""
    async with asyncio.timeout(2):
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        try:
            writer.write(
                f"GET /json/version HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n".encode()
            )
            await writer.drain()
            headers = await reader.readuntil(b"\r\n\r\n")
            if not headers.splitlines()[0].split()[1:2] == [b"200"]:
                raise BrowserUnavailable(
                    "The approved debugging endpoint refused the connection."
                )
            lengths = [
                line.split(b":", 1)[1].strip()
                for line in headers.splitlines()
                if line.lower().startswith(b"content-length:")
            ]
            if (
                len(lengths) != 1
                or not lengths[0].isdigit()
                or not 0 < int(lengths[0]) <= 16_384
            ):
                raise BrowserUnavailable("Invalid Chromium endpoint response.")
            body = await reader.readexactly(int(lengths[0]))
            endpoint = json.loads(body).get("webSocketDebuggerUrl")
        finally:
            writer.close()
            await writer.wait_closed()
    prefix = f"ws://127.0.0.1:{port}/devtools/browser/"
    if not isinstance(endpoint, str) or not endpoint.startswith(prefix):
        raise BrowserUnavailable(
            "Chromium did not advertise the approved loopback endpoint."
        )
    suffix = endpoint.removeprefix(prefix)
    if not suffix or any(char not in "0123456789abcdef-" for char in suffix):
        raise BrowserUnavailable("Invalid Chromium debugging target.")
    return endpoint


class BrowserConnection:
    def __init__(self, port: int) -> None:
        self.port = port
        self.driver: Playwright | None = None
        self.browser: Browser | None = None
        self.identity: str | None = None

    @property
    def connected(self) -> bool:
        return self.browser is not None and self.browser.is_connected()

    async def connect(self) -> None:
        if self.connected:
            return
        await self.disconnect()
        try:
            endpoint = await debugger_url(self.port)
            self.driver = await async_playwright().start()
            self.browser = await self.driver.chromium.connect_over_cdp(
                endpoint, timeout=3500, no_defaults=True
            )
            self.identity = uuid4().hex
        except (
            OSError,
            TimeoutError,
            ValueError,
            Error,
            IndexError,
            EOFError,
        ) as error:
            await self.disconnect()
            raise BrowserUnavailable(
                "Start a Chromium browser with the configured loopback debugging port and a separate profile."
            ) from error

    async def disconnect(self) -> None:
        driver, self.driver = self.driver, None
        self.browser = self.identity = None
        if driver:
            # Stop our transport; the browser and its contexts are user-owned.
            await driver.stop()

    async def page(self, marker: Correlation) -> Page:
        if not self.browser or not self.connected:
            raise BrowserUnavailable("Connect to the approved Chromium browser first.")
        pages = [
            page
            for context in self.browser.contexts
            for page in context.pages
            if not page.is_closed()
        ]
        if len(pages) > 100:
            raise PageUnavailable(
                "Close unused tabs in the debugging profile and retry."
            )
        matches = []
        for start in range(0, len(pages), 8):
            batch = pages[start : start + 8]
            matches.extend(
                page
                for page, found in zip(
                    batch,
                    await asyncio.gather(*(correlated(page, marker) for page in batch)),
                )
                if found
            )
        if len(matches) > 1:
            raise PageUnavailable(
                "Multiple browser pages carry the correlation marker. Close ambiguous tabs and rescan the intended page."
            )
        if not matches:
            raise PageUnavailable(
                "The inspected document could not be uniquely correlated. "
                "Open or rescan the intended tab in the connected debugging profile."
            )
        return matches[0]


async def correlated(page: Page, marker: Correlation) -> bool:
    try:
        async with asyncio.timeout(0.6):
            return await page.evaluate(
                "([attribute, nonce]) => document.documentElement?.getAttribute(attribute) === nonce",
                [marker.attribute, marker.nonce],
            )
    except (Error, TimeoutError):
        return False
