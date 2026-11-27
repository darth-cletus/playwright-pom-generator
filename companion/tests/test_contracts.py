import asyncio
from unittest.mock import AsyncMock

import pytest

from pom_validator.contracts import LocatorSpec, RequestError, ValidationRequest
from pom_validator.service import Service, Settings
from pom_validator.validation import classify


@pytest.mark.parametrize(
    "locator",
    [
        {"strategy": "exec", "code": "print(1)"},
        {"strategy": "css", "selector": "xpath=//input"},
        {"strategy": "css", "selector": "button >> text=example"},
        {"strategy": "role", "role": "button", "name": 1},
        {"strategy": "label", "value": "Email", "exact": False},
        {"strategy": "test-id", "attribute": "value", "value": "a"},
    ],
)
def test_rejects_executable_or_malformed_locator(locator):
    with pytest.raises(RequestError):
        LocatorSpec.parse(locator)


@pytest.mark.parametrize(
    "given, expected",
    [
        ((1, 1, True, True), ("unique-target", "confirmed")),
        ((1, 1, False, True), ("wrong-target", "wrong")),
        ((3, 1, True, True), ("ambiguous", "confirmed")),
        ((3, 1, False, True), ("ambiguous", "wrong")),
        ((1, 0, False, False), ("unique-unverified", "unverified")),
        ((1, 0, False, True), ("stale-target", "stale")),
        ((0, 1, False, True), ("no-match", "unverified")),
    ],
)
def test_identity_independent_of_cardinality(given, expected):
    assert classify(*given) == expected


def body():
    return {
        "protocol": 1,
        "requestId": "request",
        "documentKey": "document",
        "browserId": "browser",
        "correlation": {
            "attribute": "data-pom-validation-" + "a" * 32,
            "nonce": "b" * 32,
        },
        "locators": [{"strategy": "css", "selector": "button"}],
    }


def test_contract_rejects_marker_injection_and_request_limits():
    for changes in (
        {"timeout": 5000},
        {"locators": []},
        {"locators": body()["locators"] * 41},
    ):
        with pytest.raises(RequestError):
            ValidationRequest.parse(body() | changes)
    with pytest.raises(RequestError):
        ValidationRequest.parse(
            body() | {"correlation": {"attribute": "x] div", "nonce": "b" * 32}}
        )


def test_protocol_and_cancellation():
    async def exercise():
        service = Service(
            Settings(8765, 9222, "chrome-extension://" + "a" * 32, "b" * 43)
        )
        assert (await service.dispatch("/status", {"protocol": True}))[0] == 409
        started = asyncio.Event()

        async def slow(_request):
            started.set()
            await asyncio.sleep(60)

        service.validate = AsyncMock(side_effect=slow)
        task = asyncio.create_task(service.dispatch("/validate", body()))
        await started.wait()
        assert (await service.dispatch("/validate", body()))[0] == 429
        assert (
            await service.dispatch("/cancel", {"protocol": 1, "requestId": "request"})
        )[1]["cancelled"]
        assert (await task)[1]["error"] == "cancelled"
        assert not service.pending

    asyncio.run(exercise())
