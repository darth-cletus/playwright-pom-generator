import re
from dataclasses import dataclass

from playwright.async_api import FrameLocator, Locator, Page

STRATEGIES = (
    "css",
    "test-id",
    "role",
    "label",
    "placeholder",
    "text",
    "alt",
    "title",
    "chain",
    "frame",
    "filter",
    "index",
)
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
    value: str = ""
    argument: str = ""
    base: "LocatorSpec | None" = None
    child: "LocatorSpec | None" = None
    index: int = 0

    @classmethod
    def parse(cls, value: object, depth: int = 0) -> "LocatorSpec":
        if depth > 4:
            raise RequestError("Locator composition exceeds four steps.")
        data = object_value(value)
        strategy = data.get("strategy")
        if strategy not in STRATEGIES:
            raise RequestError("Unsupported locator strategy.")
        if strategy in ("chain", "frame"):
            required = {"strategy", "root", "child"}
            spec = cls(
                strategy,
                base=cls.parse(data.get("root"), depth + 1),
                child=cls.parse(data.get("child"), depth + 1),
            )
        elif strategy == "filter":
            base = cls.parse(data.get("base"), depth + 1)
            if "has" in data:
                required = {"strategy", "base", "has"}
                spec = cls(
                    strategy, base=base, child=cls.parse(data.get("has"), depth + 1)
                )
                if spec.child and spec.child.uses_frame():
                    raise RequestError("Filters cannot enter an iframe.")
            else:
                required = {"strategy", "base", "text"}
                spec = cls(strategy, string(data.get("text"), "filter text"), base=base)
        elif strategy == "index":
            required = {"strategy", "base", "index"}
            index = data.get("index")
            if type(index) is not int or not 0 <= index < 10_000:
                raise RequestError("Invalid explicit index.")
            spec = cls(
                strategy, base=cls.parse(data.get("base"), depth + 1), index=index
            )
        elif strategy == "css":
            selector = string(data.get("selector"), "CSS selector")
            unquoted = re.sub(
                r"""\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'""", " ", selector
            )
            if (
                re.match(r"^\s*(?:[/]|\.\.|[\w:-]+\s*=)", selector)
                or ">>" in unquoted
                or re.search(r":scope\b(?!\s*>)", unquoted, re.I)
            ):
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

    def test_id_attributes(self) -> set[str]:
        values = {self.argument} if self.strategy == "test-id" else set()
        for child in (self.base, self.child):
            if child:
                values.update(child.test_id_attributes())
        return values

    def uses_frame(self) -> bool:
        return self.strategy == "frame" or any(
            child.uses_frame() for child in (self.base, self.child) if child
        )

    def construct(
        self, page: Page, scope: Locator | FrameLocator | None = None
    ) -> Locator:
        receiver = scope if scope is not None else page
        if self.base:
            base = self.base.construct(page, scope)
            if self.strategy == "chain" and self.child:
                return self.child.construct(page, base)
            if self.strategy == "frame" and self.child:
                return self.child.construct(page, base.content_frame)
            if self.strategy == "filter":
                return (
                    base.filter(has=self.child.construct(page))
                    if self.child
                    else base.filter(has_text=self.value)
                )
            return base.nth(self.index)
        if self.strategy == "css":
            return receiver.locator("css=" + self.value)
        if self.strategy == "role":
            return receiver.get_by_role(self.argument, name=self.value, exact=True)
        if self.strategy == "test-id":
            return receiver.get_by_test_id(self.value)
        dispatch = {
            "label": receiver.get_by_label,
            "placeholder": receiver.get_by_placeholder,
            "text": receiver.get_by_text,
            "alt": receiver.get_by_alt_text,
            "title": receiver.get_by_title,
        }
        return dispatch[self.strategy](self.value, exact=True)


@dataclass(frozen=True)
class Correlation:
    attribute: str
    nonce: str
    target: bool
    root: bool = False

    @classmethod
    def parse(cls, value: object) -> "Correlation":
        data = object_value(value)
        attribute = string(data.get("attribute"), "correlation attribute", 64)
        nonce = string(data.get("nonce"), "correlation nonce", 32)
        if not MARKER.fullmatch(attribute) or not TOKEN.fullmatch(nonce):
            raise RequestError("Invalid correlation marker.")
        return cls(
            attribute,
            nonce,
            boolean(data, "target", True),
            boolean(data, "root", False),
        )


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
