import asyncio
import time
from datetime import UTC, datetime

from playwright.async_api import Error, Locator, Page
from playwright.async_api import TimeoutError as PlaywrightTimeout

from .browser import correlated
from .contracts import LocatorSpec, ValidationRequest

MATCH = """(nodes, [attribute, nonce]) => {
  const targets = [...document.querySelectorAll('[' + attribute + ']')]
    .filter(node => node.getAttribute(attribute) === nonce);
  return {count: nodes.length, targets: targets.length,
    matched: targets.length === 1 && nodes.includes(targets[0])};
}"""


def unavailable(spec: LocatorSpec) -> dict:
    return {
        "method": "playwright",
        "strategy": spec.strategy,
        "status": "timeout",
        "identity": "unverified",
        "timestamp": datetime.now(UTC).isoformat(),
        "durationMs": 0,
        "message": "The batch timed out before completing this candidate.",
    }


def classify(
    count: int, targets: int, matched: bool, expected: bool
) -> tuple[str, str]:
    if expected and targets != 1:
        return "stale-target", "stale"
    identity = ("confirmed" if matched else "wrong") if expected else "unverified"
    if count == 0:
        return "no-match", "unverified"
    if count > 1:
        return "ambiguous", identity
    if not expected:
        return "unique-unverified", identity
    return ("unique-target" if matched else "wrong-target"), identity


async def element_states(locator: Locator, timeout: int) -> dict[str, bool | None]:
    traits = await locator.evaluate(
        """node => ({
          checkable: node.matches('input[type=checkbox],input[type=radio],'
            + '[role=checkbox],[role=radio],[role=switch],[role=menuitemcheckbox],[role=menuitemradio]'),
          readOnly: 'readOnly' in node ? node.readOnly
            : node.hasAttribute('aria-readonly') ? node.getAttribute('aria-readonly') === 'true' : null
        })""",
        timeout=timeout,
    )
    try:
        editable = await locator.is_editable(timeout=timeout)
    except Error:
        editable = None
    try:
        checked = (
            await locator.is_checked(timeout=timeout) if traits["checkable"] else None
        )
    except Error:
        checked = None
    return {
        "attached": True,
        "visible": await locator.is_visible(),
        "enabled": await locator.is_enabled(timeout=timeout),
        "editable": editable,
        "readOnly": traits["readOnly"],
        "checked": checked,
    }


async def trial_action(locator: Locator, action: str, timeout: int) -> str:
    if action in ("none", "fill", "select"):
        return "not-requested" if action == "none" else "unsupported"
    actions = {"click": locator.click, "hover": locator.hover, "check": locator.check}
    try:
        await actions[action](trial=True, timeout=timeout)
        return "passed"
    except PlaywrightTimeout:
        return "timeout"
    except Error:
        return "failed"


async def resolve_scope(
    page: Page,
    spec: LocatorSpec,
    result: dict,
    root_marker: str | None,
    scope: Locator | None = None,
) -> Locator | None:
    if spec.strategy != "chain" or not spec.base or not spec.child:
        return spec.construct(page, scope)
    parent = await resolve_scope(page, spec.base, {}, None, scope)
    if parent is None:
        result.update(rootCount=0, rootIdentity="unverified")
        return None
    count = await parent.count()
    result.update(rootCount=count, rootIdentity="unverified")
    if count != 1:
        return None
    if root_marker:
        confirmed = await parent.and_(page.locator(root_marker)).count() == 1
        result["rootIdentity"] = "confirmed" if confirmed else "wrong"
        if not confirmed:
            return None
    return await resolve_scope(page, spec.child, {}, None, parent)


async def measure(page: Page, spec: LocatorSpec, request: ValidationRequest) -> dict:
    start = time.monotonic()
    marker = request.correlation
    result: dict = {
        "method": "playwright",
        "strategy": spec.strategy,
        "status": "validation-error",
        "identity": "unverified",
        "timestamp": datetime.now(UTC).isoformat(),
    }
    try:
        async with asyncio.timeout(request.timeout / 1000 + 0.5):
            if not await correlated(page, marker):
                result["status"] = "stale-document"
                return result
            root_marker = (
                f'css=[{marker.attribute}-root="{marker.nonce}"]'
                if marker.root
                else None
            )
            locator = await resolve_scope(page, spec, result, root_marker)
            if locator is None:
                result["message"] = (
                    "The component root did not resolve uniquely to the intended instance."
                )
                return result
            target_args = [marker.attribute + "-target", marker.nonce]
            measured = await locator.evaluate_all(MATCH, target_args)
            count = measured["count"]
            status, identity = classify(
                count, measured["targets"], measured["matched"], marker.target
            )
            result.update(count=count, status=status, identity=identity)
            if count == 1 and status != "stale-target":
                if request.states:
                    try:
                        result["states"] = await element_states(
                            locator, request.timeout
                        )
                    except Error:
                        result["stateError"] = "Element states could not be read."
                if request.trial != "none":
                    result["actionability"] = {
                        "action": request.trial,
                        "status": await trial_action(
                            locator.and_(
                                page.locator(f'css=[{target_args[0]}="{marker.nonce}"]')
                            ),
                            request.trial,
                            request.timeout,
                        )
                        if identity == "confirmed"
                        else "unverified",
                    }
            if not await correlated(page, marker):
                result.update(status="stale-document", identity="stale")
            elif (
                spec.strategy == "chain"
                and await resolve_scope(page, spec, {}, root_marker) is None
            ):
                result.update(status="stale-target", identity="stale")
            elif await locator.evaluate_all(MATCH, target_args) != measured:
                result.update(status="stale-target", identity="stale")
    except (TimeoutError, PlaywrightTimeout):
        result.update(
            status="timeout",
            identity="unverified",
            message="Locator evaluation timed out.",
        )
    except Error:
        result.update(
            status="validation-error",
            identity="unverified",
            message="Playwright could not evaluate the locator.",
        )
    finally:
        result["durationMs"] = round((time.monotonic() - start) * 1000, 1)
    return result
