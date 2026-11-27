import asyncio
import socket
import time
from pathlib import Path

from playwright.async_api import async_playwright

from pom_validator.browser import debugger_url
from pom_validator.service import Service, Settings


def port_number():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_real_python_playwright_cdp_identity_states_and_trials(tmp_path):
    async def exercise():
        port = port_number()
        marker = {
            "attribute": "data-pom-validation-" + "a" * 32,
            "nonce": "b" * 32,
            "target": True,
        }
        fixture = (
            Path(__file__).resolve().parents[2] / "fixtures/inspector.html"
        ).read_text("utf8")
        async with async_playwright() as owner:
            context = await owner.chromium.launch_persistent_context(
                tmp_path, channel="chromium", args=[f"--remote-debugging-port={port}"]
            )
            service = Service(
                Settings(8765, port, "chrome-extension://" + "a" * 32, "b" * 43)
            )
            try:
                page = context.pages[0]
                duplicate = await context.new_page()
                await duplicate.set_content(fixture)
                await page.set_content(
                    fixture
                    + """
                    <label for="sample">Sample field</label>
                    <input id="sample" placeholder="Example" readonly>
                    <input id="checked" type="checkbox" checked>
                    <img id="image" alt="Example image">
                    <button id="disabled" title="Disabled title" disabled>Disabled</button>
                    <button id="hidden" hidden>Hidden label</button>
                """
                )
                assert duplicate.url == page.url
                await debugger_url(port)
                status, connected = await service.dispatch("/connect", {"protocol": 1})
                assert status == 200, connected
                browser_id = connected["browserId"]
                assert browser_id
                await page.evaluate(
                    "([key, nonce]) => document.documentElement.setAttribute(key, nonce)",
                    [marker["attribute"], marker["nonce"]],
                )

                async def target(selector):
                    await page.evaluate(
                        """([key, nonce, selector]) => {
                            document.querySelectorAll('[' + key + ']').forEach(node => node.removeAttribute(key));
                            document.querySelector(selector)?.setAttribute(key, nonce);
                        }""",
                        [marker["attribute"] + "-target", marker["nonce"], selector],
                    )

                async def validate(items, **options):
                    status, reply = await service.dispatch(
                        "/validate",
                        {
                            "protocol": 1,
                            "requestId": "test",
                            "browserId": browser_id,
                            "documentKey": "doc",
                            "correlation": marker,
                            "locators": items,
                            **options,
                        },
                    )
                    assert status == 200, reply
                    return reply["results"]

                def css(selector):
                    return {"strategy": "css", "selector": selector}

                dental = {
                    "strategy": "test-id",
                    "attribute": "data-testid",
                    "value": "dental-plans",
                }
                role = {"strategy": "role", "role": "button", "name": "See plans"}
                await target("#dental-trigger")
                first = await validate(
                    [role, dental, css('[data-testid="vision-plans"]'), css("#nothing")]
                )
                assert [
                    (item["status"], item["count"], item["identity"]) for item in first
                ] == [
                    ("ambiguous", 3, "confirmed"),
                    ("unique-target", 1, "confirmed"),
                    ("wrong-target", 1, "wrong"),
                    ("no-match", 0, "unverified"),
                ]
                assert first[1]["durationMs"] >= 0 and first[1]["timestamp"]
                await page.locator('[data-testid="dental-card"]').evaluate(
                    "(node, [key, nonce]) => node.setAttribute(key, nonce)",
                    [marker["attribute"] + "-root", marker["nonce"]],
                )
                marker["root"] = True
                parent = {
                    "strategy": "filter",
                    "base": css("article.card"),
                    "has": {"strategy": "role", "role": "heading", "name": "Dental"},
                }
                selected = {"strategy": "chain", "root": parent, "child": role}
                incorrect = {
                    "strategy": "chain",
                    "root": {
                        "strategy": "index",
                        "base": css("article.card"),
                        "index": 1,
                    },
                    "child": role,
                }
                ambiguous = {
                    "strategy": "chain",
                    "root": css("article.card"),
                    "child": role,
                }
                scoped = await validate([selected, incorrect, ambiguous], states=False)
                assert (
                    scoped[0]["status"] == "unique-target"
                    and scoped[0]["rootIdentity"] == "confirmed"
                )
                assert scoped[1]["rootIdentity"] == "wrong" and "count" not in scoped[1]
                assert scoped[2]["rootCount"] == 3 and "count" not in scoped[2]
                marker.pop("root")
                partial = await validate([css("["), dental])
                assert [item["status"] for item in partial] == [
                    "validation-error",
                    "unique-target",
                ]
                await page.bring_to_front()
                assert (await validate([dental], trial="click", timeout=3000))[0][
                    "actionability"
                ]["status"] == "passed"
                assert await page.locator("#actions").inner_text() == "0"
                assert (await validate([dental], trial="fill"))[0]["actionability"][
                    "status"
                ] == "unsupported"

                await page.locator("#dental-trigger").evaluate(
                    "(node) => node.setAttribute('data-qa', 'other-id')"
                )
                alternative = {
                    "strategy": "test-id",
                    "attribute": "data-qa",
                    "value": "other-id",
                }
                assert [
                    item["status"] for item in await validate([alternative, dental])
                ] == ["unique-target"] * 2
                marker["target"] = False
                assert (await validate([dental]))[0]["status"] == "unique-unverified"
                marker["target"] = True

                await target("#sample")
                label = {"strategy": "label", "value": "Sample field"}
                placeholder = {"strategy": "placeholder", "value": "Example"}
                readings = await validate([label, placeholder])
                assert all(item["status"] == "unique-target" for item in readings)
                assert readings[0]["states"]["readOnly"] is True
                assert readings[0]["states"]["editable"] is False
                await target("#image")
                assert (
                    await validate([{"strategy": "alt", "value": "Example image"}])
                )[0]["status"] == "unique-target"
                await target("#disabled")
                disabled = (
                    await validate(
                        [{"strategy": "title", "value": "Disabled title"}],
                        trial="click",
                        timeout=300,
                    )
                )[0]
                assert disabled["states"]["enabled"] is False
                assert disabled["actionability"]["status"] == "timeout"
                await target("#hidden")
                hidden = (
                    await validate([{"strategy": "text", "value": "Hidden label"}])
                )[0]
                assert (
                    hidden["status"] == "unique-target"
                    and not hidden["states"]["visible"]
                )
                await target("#checked")
                assert (await validate([css("#checked")]))[0]["states"]["checked"]
                await page.locator("#checked").evaluate(
                    "node => node.replaceWith(document.createElement('input'))"
                )
                assert (await validate([css("#checked")]))[0][
                    "status"
                ] == "stale-target"

                await target("#dental-trigger")
                timings = []
                for size in (1, 8, 10, 50):
                    started = time.perf_counter()
                    for start in range(0, size, 25):
                        await validate([role] * min(size - start, 25), states=False)
                    timings.append(
                        (size, round((time.perf_counter() - started) * 1000))
                    )
                await page.evaluate("""() => {
                    const fragment = document.createDocumentFragment();
                    for (let i=0;i<2500;i++) {
                        const button = document.createElement('button');
                        button.id = 'runtime-' + i;
                        fragment.append(button);
                    }
                    document.body.append(fragment);
                }""")
                started = time.perf_counter()
                assert (await validate([role, dental], states=False))[1][
                    "status"
                ] == "unique-target"
                print(
                    f"CDP batch timing milliseconds {timings}, large DOM {round((time.perf_counter() - started) * 1000)}"
                )
                rows = []
                for size in (10, 50):
                    started = time.perf_counter()
                    for index in range(size):
                        selector = f"#runtime-{index}"
                        await target(selector)
                        assert (await validate([css(selector)], states=False))[0][
                            "status"
                        ] == "unique-target"
                    rows.append((size, round((time.perf_counter() - started) * 1000)))
                print(f"Selected-row validation milliseconds on large DOM {rows}")
                await page.reload()
                request = {
                    "protocol": 1,
                    "requestId": "reload",
                    "browserId": browser_id,
                    "documentKey": "doc",
                    "correlation": marker,
                    "locators": [dental],
                }
                rejected, reply = await service.dispatch("/validate", request)
                assert rejected == 409 and reply["error"] == "correlation"
                assert (await service.dispatch("/disconnect", {"protocol": 1}))[
                    0
                ] == 200
                assert not page.is_closed() and not duplicate.is_closed()
            finally:
                await service.close()
                await context.close()

    asyncio.run(exercise())
