#!/usr/bin/env python3
"""Sanitize log files by obfuscating sensitive tokens.

Replaces token values with [REDACTED] to prevent sensitive data leakage.

Usage:
    tools/sanitize-logs.py <file1> <file2> ...
    tools/sanitize-logs.py out/ui/*.log
"""

import re
import sys
from pathlib import Path


def obfuscate_tokens(content: str) -> str:
    """Replace token values with [REDACTED].

    Args:
        content: The file content to process.

    Returns:
        The content with token values replaced by [REDACTED].
    """
    # Pattern matches: "token": "value" or "token": "value",
    pattern = r'("token"\s*:\s*")[^"]+'
    replacement = r"\1[REDACTED]"
    return re.sub(pattern, replacement, content, flags=re.IGNORECASE)


def process_file(file_path: Path) -> bool:
    """Process a single file, obfuscating tokens in place.

    Args:
        file_path: Path to the file to process.

    Returns:
        True if the file was modified, False otherwise.
    """
    try:
        content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
    except OSError as e:
        sys.stderr.write(f"Error processing {file_path}: {e}\n")
        return False

    obfuscated = obfuscate_tokens(content)

    # Only write if content changed
    if obfuscated == content:
        return False

    try:
        Path(file_path).write_text(obfuscated, encoding="utf-8", errors="ignore")
    except OSError as e:
        sys.stderr.write(f"Error writing {file_path}: {e}\n")
        return False

    sys.stderr.write(f"Sanitized: {file_path}\n")
    return True


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: sanitize-logs <file1> <file2> ...\n")
        sys.exit(1)

    files_processed = 0
    for file_arg in sys.argv[1:]:
        file_path = Path(file_arg)
        if not file_path.exists():
            sys.stderr.write(f"Warning: File not found: {file_path}\n")
            continue
        if file_path.is_file():
            if process_file(file_path):
                files_processed += 1
        elif file_path.is_dir():
            sys.stderr.write(f"Warning: {file_path} is a directory, skipping\n")

    if files_processed > 0:
        sys.stderr.write(f"Successfully sanitized {files_processed} file(s)\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
