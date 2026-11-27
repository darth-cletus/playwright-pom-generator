import re
from dataclasses import dataclass

from playwright.async_api import Locator, Page

STRATEGIES = ("css", "test-id", "role", "label", "placeholder", "text", "alt", "title")
ROLE = re.compile(r"[a-z]{1,32}")
MARKER = re.compile(r"data-pom-validation-[a-f0-9]{32}")
TOKEN = re.compile(r"[a-f0-9]{32}")
TEST_ID = re.compile(r"data-[a-z0-9_-]{1,100}")


class RequestError(ValueError):
    pass


def object_value(value: object) -> dict:
    if not isinstance(value, dict):
        raise RequestError("Expected a JSON object.")
    return value


def string(value: object, name: str, limit: int = 4096) -> str:
    if not isinstance(value, str) or not value or len(value) > limit:
        raise RequestError(f"Invalid {name}.")
    return value


def boolean(data: dict, name: str, default: bool) -> bool:
    value = data.get(name, default)
    if type(value) is not bool:
        raise RequestError(f"Invalid {name} option.")
    return value


@dataclass(frozen=True)
class LocatorSpec:
    strategy: str
    value: str
    argument: str = ""

    @classmethod
    def parse(cls, value: object) -> "LocatorSpec":
        data = object_value(value)
        strategy = data.get("strategy")
        if strategy not in STRATEGIES:
            raise RequestError("Unsupported locator strategy.")
        if strategy == "css":
            selector = string(data.get("selector"), "CSS selector")
            unquoted = re.sub(
                r"""\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'""", " ", selector
            )
            if re.match(r"^\s*(?:[/]|\.\.|[\w:-]+\s*=)", selector) or ">>" in unquoted:
                raise RequestError("Only a single CSS selector is supported.")
            required = {"strategy", "selector"}
            spec = cls(strategy, selector)
        elif strategy == "role":
            role = string(data.get("role"), "role", 32)
            if not ROLE.fullmatch(role):
                raise RequestError("Invalid accessibility role.")
            required = {"strategy", "role", "name"}
            spec = cls(strategy, string(data.get("name"), "accessible name"), role)
        elif strategy == "test-id":
            attribute = string(data.get("attribute"), "test ID attribute")
            if not TEST_ID.fullmatch(attribute):
                raise RequestError("Invalid test ID attribute.")
            required = {"strategy", "attribute", "value"}
            spec = cls(strategy, string(data.get("value"), "test ID"), attribute)
        else:
            required = {"strategy", "value"}
            spec = cls(strategy, string(data.get("value"), "locator value"))
        if set(data) != required:
            raise RequestError("Unexpected locator options.")
        return spec

    def construct(self, page: Page) -> Locator:
        if self.strategy == "css":
            return page.locator("css=" + self.value)
        if self.strategy == "role":
            return page.get_by_role(self.argument, name=self.value, exact=True)
        if self.strategy == "test-id":
            return page.get_by_test_id(self.value)
        dispatch = {
            "label": page.get_by_label,
            "placeholder": page.get_by_placeholder,
            "text": page.get_by_text,
            "alt": page.get_by_alt_text,
            "title": page.get_by_title,
        }
        return dispatch[self.strategy](self.value, exact=True)


@dataclass(frozen=True)
class Correlation:
    attribute: str
    nonce: str
    target: bool

    @classmethod
    def parse(cls, value: object) -> "Correlation":
        data = object_value(value)
        attribute = string(data.get("attribute"), "correlation attribute", 64)
        nonce = string(data.get("nonce"), "correlation nonce", 32)
        if not MARKER.fullmatch(attribute) or not TOKEN.fullmatch(nonce):
            raise RequestError("Invalid correlation marker.")
        return cls(attribute, nonce, boolean(data, "target", True))


@dataclass(frozen=True)
class ValidationRequest:
    request_id: str
    browser_id: str
    document_key: str
    correlation: Correlation
    locators: tuple[LocatorSpec, ...]
    states: bool
    trial: str
    timeout: int

    @classmethod
    def parse(cls, value: object) -> "ValidationRequest":
        data = object_value(value)
        items = data.get("locators")
        if not isinstance(items, list) or not 1 <= len(items) <= 40:
            raise RequestError("Send between 1 and 40 locator candidates.")
        trial = data.get("trial", "none")
        if trial not in ("none", "click", "hover", "check", "fill", "select"):
            raise RequestError("Invalid trial action.")
        timeout = data.get("timeout", 1500)
        if type(timeout) is not int or not 100 <= timeout <= 3000:
            raise RequestError("Timeout must be between 100 and 3000 milliseconds.")
        return cls(
            string(data.get("requestId"), "request ID", 80),
            string(data.get("browserId"), "browser session ID", 80),
            string(data.get("documentKey"), "document key", 100),
            Correlation.parse(data.get("correlation")),
            tuple(LocatorSpec.parse(item) for item in items),
            boolean(data, "states", True),
            trial,
            timeout,
        )
