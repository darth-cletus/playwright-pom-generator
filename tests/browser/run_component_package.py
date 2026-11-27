import ast
import importlib
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

from playwright.sync_api import sync_playwright


def main() -> None:
    fixture = Path(sys.argv[2]).read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as directory, ZipFile(sys.argv[1]) as archive:
        assert archive.testzip() is None
        assert "generated/components/specialty_plan_card.py" in archive.namelist()
        for name in archive.namelist():
            path = Path(directory, name).resolve()
            assert path.is_relative_to(directory)
            source = archive.read(name).decode("utf-8")
            ast.parse(source)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(source, encoding="utf-8")
        sys.path.insert(0, directory)
        module = importlib.import_module("generated.pages.plans_page")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.set_content(fixture)
            plans = module.PlansPage(page)
            assert plans.get_specialty_plan_card_count() == 3
            assert plans.get_specialty_plan_card_at(1).heading.inner_text() == "Vision"
            assert plans.get_specialty_plan_card("Life").heading.inner_text() == "Life"
            assert (
                plans.get_specialty_plan_card(
                    "Life"
                ).available_component.status.inner_text()
                == "Available"
            )
            assert plans.dental_component.has_promotion()
            assert not plans.vision_component.has_promotion()
            plans.get_specialty_plan_card("Vision").click_see_plans_button()
            assert page.locator("#choice").inner_text() == "Vision"
            browser.close()


if __name__ == "__main__":
    main()
