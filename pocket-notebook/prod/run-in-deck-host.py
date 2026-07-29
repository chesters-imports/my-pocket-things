#!/usr/bin/env python3
"""My Pocket Notebook → Deck Host"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

PROD = Path(__file__).resolve().parent
SYS = PROD / "notes_sys"
DECK = PROD.parents[2] / "the-deck-host" / "shell" / "deck_host.py"
PORT = os.environ.get("NOTES_PORT", "43165")
URL = f"http://127.0.0.1:{PORT}/"
HEALTH = f"http://127.0.0.1:{PORT}/api/health"


def main() -> int:
    if not (SYS / "server.py").is_file():
        print("server missing", file=sys.stderr)
        return 1
    if not DECK.is_file():
        print(f"Deck Host missing: {DECK}", file=sys.stderr)
        return 1
    w = os.environ.get("NOTES_WIDTH", "980")
    h = os.environ.get("NOTES_HEIGHT", "700")
    cmd = [
        sys.executable,
        str(DECK),
        "--title",
        "My Pocket Notebook",
        "--profile",
        "desk",
        "--width",
        str(w),
        "--height",
        str(h),
        "--url",
        URL,
        "--health",
        HEALTH,
        "--health-timeout",
        "20",
        "--spawn",
        f"{sys.executable} server.py",
        "--spawn-cwd",
        str(SYS),
    ]
    print("My Pocket Notebook · CO.MYPT-002-NOTES · Deck Host")
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
