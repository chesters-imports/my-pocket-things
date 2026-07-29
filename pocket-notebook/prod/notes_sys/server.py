#!/usr/bin/env python3
"""My Pocket Notebook · CO.MYPT-002-NOTES"""

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
PORT = 43165


def load() -> dict[str, Any]:
    if not DATA.is_file():
        return {
            "schema": "mypt-notes.v1",
            "sku": "CO.MYPT-002-NOTES",
            "notebooks": [],
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
                {
                    "ok": True,
                    "sku": "CO.MYPT-002-NOTES",
                    "service": "pocket-notebook",
                    "port": PORT,
                },
            )
            return
        if path == "/api/library":
            self._json(200, {"ok": True, "library": load()})
            return
        return super().do_GET()

    def do_PUT(self) -> None:
        if urlparse(self.path).path == "/api/library":
            body = self._read_json()
            doc = body.get("library") if isinstance(body.get("library"), dict) else body
            if not isinstance(doc, dict):
                self._json(400, {"ok": False, "error": "object required"})
                return
            doc.setdefault("schema", "mypt-notes.v1")
            doc.setdefault("sku", "CO.MYPT-002-NOTES")
            if not isinstance(doc.get("notebooks"), list):
                doc["notebooks"] = []
            save(doc)
            self._json(200, {"ok": True, "library": load()})
            return
        self._json(404, {"ok": False, "error": "not found"})


def main() -> None:
    if not DATA.is_file():
        save(load())
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"My Pocket Notebook  http://{HOST}:{PORT}/")
    print(f"SKU CO.MYPT-002-NOTES · {DATA}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nclosed the pocket")


if __name__ == "__main__":
    main()
