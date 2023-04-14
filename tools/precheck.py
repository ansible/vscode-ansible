"""Check that the python3 executable points to Python 3.9 or newer."""
import sys

if sys.version_info < (3, 9):
    print(
        "FATAL: python3 executable must point to Python 3.9 or newer for tests to work",
        file=sys.stderr)
    sys.exit(99)
