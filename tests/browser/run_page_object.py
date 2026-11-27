import ast
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


source = sys.stdin.buffer.read().decode("utf-8")
scope = {}
exec(compile(ast.parse(source), "<generated-page-object>", "exec"), scope)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    try:
        page = browser.new_page()
        page.set_content(Path(sys.argv[1]).read_text(encoding="utf-8"))
        login = scope["GeneratedPage"](page)
        login.fill_email_address_input("fixture@example.com")
        login.fill_passphrase_input("fixture-password")
        login.click_edit_button()
        assert login.email_address_input.get_attribute("id") == "email-2"
        assert login.email_address_input.input_value() == "fixture@example.com"
        assert login.passphrase_input.input_value() == "fixture-password"
        assert login.edit_button.get_attribute("data-testid") == "repeat"
        assert login.save_settings_button.get_attribute("id") == "aria"
    finally:
        browser.close()
