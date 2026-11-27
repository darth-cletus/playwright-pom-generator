import argparse
import asyncio
import getpass
import logging
import os
import secrets
import threading

from .service import LocalServer, Service, Settings


def main() -> None:
    parser = argparse.ArgumentParser(prog="pom-validator")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("token", help="Generate a local pairing token")
    serve = commands.add_parser("serve", help="Start the local companion")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--debug-port", type=int, default=9222)
    serve.add_argument("--extension-id", required=True)
    args = parser.parse_args()
    if args.command == "token":
        print(secrets.token_urlsafe(32))
        return
    token = os.getenv("POM_VALIDATOR_TOKEN") or getpass.getpass(
        "Companion pairing token: "
    )
    try:
        settings = Settings(
            args.port, args.debug_port, f"chrome-extension://{args.extension_id}", token
        )
    except ValueError as error:
        parser.error(str(error))
        return
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    loop = asyncio.new_event_loop()
    service = Service(settings)
    with LocalServer(settings, loop, service) as server:
        worker = threading.Thread(target=loop.run_forever, daemon=True)
        worker.start()
        logging.info("event=service_ready port=%s protocol=1", args.port)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            asyncio.run_coroutine_threadsafe(service.close(), loop).result(timeout=8)
            loop.call_soon_threadsafe(loop.stop)
            worker.join()
            loop.close()


if __name__ == "__main__":
    main()
