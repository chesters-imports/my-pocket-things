#!/usr/bin/env python3
"""My Pocket Chapbook · CO.MYPT-001-CHAPS"""

from __future__ import annotations

import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "library.json"
HOST = "127.0.0.1"
PORT = 43160


def load() -> dict[str, Any]:
    if not DATA.is_file():
        return {
            "schema": "mypt-chaps.v1",
            "sku": "CO.MYPT-001-CHAPS",
            "poem_seq": 1,
            "poems": [],
            "chapbooks": [],
        }
    return json.loads(DATA.read_text(encoding="utf-8"))


def save(doc: dict[str, Any]) -> None:
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, code: int, obj: Any) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> dict[str, Any]:
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json(
                200,
                {"ok": True, "sku": "CO.MYPT-001-CHAPS", "service": "pocket-chapbook"},
            )
            return
        if path == "/api/library":
            self._json(200, load())
            return
        return super().do_GET()

    def do_PUT(self) -> None:
        if urlparse(self.path).path == "/api/library":
            doc = self._read_json()
            if not isinstance(doc, dict):
                self._json(400, {"ok": False, "error": "object required"})
                return
            save(doc)
            self._json(200, {"ok": True})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if urlparse(self.path).path == "/api/library":
            return self.do_PUT()
        self._json(404, {"ok": False, "error": "not found"})


def main() -> int:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(
        f"My Pocket Chapbook · CO.MYPT-001-CHAPS · http://{HOST}:{PORT}/",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstop", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
