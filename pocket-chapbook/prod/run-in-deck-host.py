#!/usr/bin/env python3
"""My Pocket Chapbook → Deck Host"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

PROD = Path(__file__).resolve().parent
SYS = PROD / "chaps_sys"
DECK = PROD.parents[2] / "the-deck-host" / "shell" / "deck_host.py"
PORT = os.environ.get("CHAPS_PORT", "43160")
URL = f"http://127.0.0.1:{PORT}/"
HEALTH = f"http://127.0.0.1:{PORT}/api/health"


def main() -> int:
    if not (SYS / "server.py").is_file():
        print("server missing", file=sys.stderr)
        return 1
    if not DECK.is_file():
        print(f"Deck Host missing: {DECK}", file=sys.stderr)
        return 1
    w = os.environ.get("CHAPS_WIDTH", "1100")
    h = os.environ.get("CHAPS_HEIGHT", "720")
    cmd = [
        sys.executable,
        str(DECK),
        "--title",
        "My Pocket Chapbook",
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
    print("My Pocket Chapbook · CO.MYPT-001-CHAPS · Deck Host")
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
