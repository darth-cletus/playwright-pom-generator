import subprocess
from time import perf_counter

import pytest
from playwright.sync_api import sync_playwright

from pom_validator.contracts import RequestError
from pom_validator.source import analyze, transform

SOURCE = (
    "# Café\r\n"
    "raise RuntimeError('must not execute')\r\n"
    "PAYMENT = '#old'\r\n"
    "class Checkout:\r\n"
    "    def __init__(self, page):\r\n"
    "        self.payment = page.locator(PAYMENT)  # keep\r\n"
    "        self.unsupported = page.locator(calculate())\r\n"
    "        self.frame = page.frame_locator('#bill').get_by_test_id('card')\r\n"
    "    def pay(self):\r\n"
    "        return self.payment.click()"
)


def test_static_analysis_and_revision_bound_patch(tmp_path):
    result = analyze({"source": SOURCE})
    first, frame = result["entries"]
    assert first["dependencies"] == ["PAYMENT"]
    assert first["locator"] == {"strategy": "css", "selector": "#old"}
    assert frame["locator"]["strategy"] == "frame"
    body = {"source": SOURCE, "filename": "page.py", "revision": result["revision"]}
    assert transform(body | {"changes": []}) == {"source": SOURCE, "patch": ""}
    change = {"id": first["id"], "locator": {"strategy": "css", "selector": "#new"}}
    updated = transform(body | {"changes": [change]})
    expected = SOURCE.replace("page.locator(PAYMENT)", "page.locator('#new')")
    assert updated["source"] == expected
    (tmp_path / "page.py").write_bytes(SOURCE.encode())
    if subprocess.run(["git", "--version"], capture_output=True).returncode == 0:
        subprocess.run(
            ["git", "apply", "--check", "-"],
            cwd=tmp_path,
            input=updated["patch"].encode(),
            check=True,
        )
    with pytest.raises(RequestError, match="revision conflict"):
        transform(body | {"source": SOURCE + "\r\n", "changes": [change]})


def test_unsupported_and_commented_source_is_preserved():
    source = """class Example:
    def __init__(self, page):
        self.read_only = page.locator(
            "#old",  # retain this note
        )
        self.dynamic = page.locator(f"{self.value}")
"""
    parsed = analyze({"source": source})
    (entry,) = parsed["entries"]
    assert not entry["editable"]
    assert parsed["diagnostics"] == [{"line": 6, "code": "unsupported-locator"}]
    with pytest.raises(RequestError, match="Invalid"):
        transform(
            {
                "source": source,
                "filename": "page.py",
                "revision": parsed["revision"],
                "changes": [{"id": entry["id"], "locator": entry["locator"]}],
            }
        )


def test_trusted_transformation_executes_with_playwright():
    source = """class Checkout:
    def __init__(self, page):
        self.confirm = page.locator("#old")
"""
    analysis = analyze({"source": source})
    updated = transform(
        {
            "source": source,
            "filename": "checkout.py",
            "revision": analysis["revision"],
            "changes": [
                {
                    "id": analysis["entries"][0]["id"],
                    "locator": {"strategy": "css", "selector": "#new"},
                }
            ],
        }
    )
    trusted = {}
    exec(updated["source"], trusted)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page()
            page.set_content('<button id="new">Confirm</button>')
            assert trusted["Checkout"](page).confirm.text_content() == "Confirm"
        finally:
            browser.close()


def test_source_workload():
    source = "class Checkout:\n    def __init__(self, page):\n" + "".join(
        f"        self.item_{index} = page.locator('#old-{index}')\n"
        for index in range(250)
    )
    started = perf_counter()
    analysis = analyze({"source": source})
    analysis_ms = (perf_counter() - started) * 1000
    assert len(analysis["entries"]) == 250
    started = perf_counter()
    updated = transform(
        {
            "source": source,
            "filename": "checkout.py",
            "revision": analysis["revision"],
            "changes": [
                {
                    "id": entry["id"],
                    "locator": {"strategy": "css", "selector": f"#new-{index}"},
                }
                for index, entry in enumerate(analysis["entries"][:25])
            ],
        }
    )
    print(
        f"250-assignment analysis {analysis_ms:.1f} ms; 25 changes {(perf_counter() - started) * 1000:.1f} ms"
    )
    assert updated["source"].count("#new-") == 25
