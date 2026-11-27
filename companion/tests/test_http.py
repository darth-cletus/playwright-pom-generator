import asyncio
import http.client
import json
import socket
import threading
from contextlib import contextmanager

from pom_validator.service import MAX_BYTES, LocalServer, Service, Settings

ORIGIN = "chrome-extension://" + "a" * 32
TOKEN = "x" * 43


def free_port():
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        return connection.getsockname()[1]


@contextmanager
def running_service():
    settings = Settings(free_port(), free_port(), ORIGIN, TOKEN)
    loop = asyncio.new_event_loop()
    service = Service(settings)
    with LocalServer(settings, loop, service) as server:
        worker = threading.Thread(target=loop.run_forever)
        http = threading.Thread(target=server.serve_forever)
        worker.start()
        http.start()
        try:
            yield settings.port
        finally:
            server.shutdown()
            http.join()
            asyncio.run_coroutine_threadsafe(service.close(), loop).result(5)
            loop.call_soon_threadsafe(loop.stop)
            worker.join()
            loop.close()


def post(port, route="/status", override=None, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=8)
    headers = {
        "Origin": ORIGIN,
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
    }
    headers.update(override or {})
    try:
        conn.request("POST", "/api/v1" + route, body or '{"protocol":1}', headers)
        response = conn.getresponse()
        return response.status, json.loads(response.read())
    finally:
        conn.close()


def test_http_auth_origin_host_and_limits(caplog):
    with running_service() as port:
        assert post(port, override={"Authorization": "Bearer invalid"})[0] == 401
        assert post(port, override={"Origin": "https://untrusted.invalid"})[0] == 403
        assert post(port, override={"Host": "rebound.invalid"})[0] == 403
        assert post(port, override={"Content-Length": str(MAX_BYTES + 1)})[0] == 413
        assert post(port, override={"Content-Type": "text/plain"})[0] == 415
        assert post(port, route="/arbitrary-code")[0] == 404
        status, reply = post(port)
        assert status == 200
        assert reply["protocol"] == 1 and not reply["connected"]
        assert post(port, route="/connect")[1]["error"] == "connection"
    assert TOKEN not in caplog.text
    assert TOKEN not in json.dumps(reply)
