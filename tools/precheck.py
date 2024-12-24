"""Check that the python3 executable points to Python 3.9 or newer."""

import os
import sys

if sys.version_info < (3, 9):
    print(
        "FATAL: python3 executable must point to Python 3.9 or newer for tests to work",
        file=sys.stderr,
    )
    sys.exit(99)

if "--max-old-space-size" not in os.environ.get("NODE_OPTIONS", "") != "ignore":
    print(
        "FATAL: NODE_OPTIONS variable was not found, this likely means that .envrc file was not"
        " loaded. Build will likely fail.",
        file=sys.stderr,
    )
    sys.exit(98)
