"""Unit tests for check_uv_lock_downgrades."""

from __future__ import annotations

import logging
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import tomllib
from check_uv_lock_downgrades import (
    PackageKey,
    find_downgrades,
    format_report,
    locked_versions,
    main,
)


def _lock(*packages: str, root_deps: list[str] | None = None) -> str:
    """Build a minimal uv.lock TOML document.

    Args:
        packages: Raw ``[[package]]`` TOML blocks.
        root_deps: Direct dependency names for the root package.

    Returns:
        Complete uv.lock document text.
    """
    parts = ["version = 1", "revision = 1", ""]
    for block in packages:
        parts.extend((block.strip(), ""))
    deps = root_deps or ["ruff", "mypy"]
    requires = ",\n".join(
        f'    {{ name = "{name}", specifier = ">=0" }}' for name in deps
    )
    # Match uv.lock shape: std tables, not multiline inline tables.
    root_block = f"""\
[[package]]
name = "vscode-ansible"
source = {{ virtual = "." }}

[package.metadata]

[package.metadata.requires-dev]
lint = [
{requires}
]
"""
    parts.extend((root_block, ""))
    return "\n".join(parts)


RUFF_010 = """\
[[package]]
name = "ruff"
version = "0.10.0"
source = { registry = "https://pypi.org/simple" }
"""

RUFF_014 = """\
[[package]]
name = "ruff"
version = "0.14.3"
source = { registry = "https://pypi.org/simple" }
"""

MYPY_110 = """\
[[package]]
name = "mypy"
version = "1.10.0"
source = { registry = "https://pypi.org/simple" }
"""

MYPY_117 = """\
[[package]]
name = "mypy"
version = "1.17.1"
source = { registry = "https://pypi.org/simple" }
"""

TRANSITIVE_OLD = """\
[[package]]
name = "click"
version = "8.0.0"
source = { registry = "https://pypi.org/simple" }
"""

TRANSITIVE_NEW = """\
[[package]]
name = "click"
version = "8.1.0"
source = { registry = "https://pypi.org/simple" }
"""

ANSIBLE_CORE_BASE = """\
[[package]]
name = "ansible-core"
version = "2.19.11"
source = { registry = "https://pypi.org/simple" }
resolution-markers = [
    "python_full_version < '3.12'",
]

[[package]]
name = "ansible-core"
version = "2.21.1"
source = { registry = "https://pypi.org/simple" }
resolution-markers = [
    "python_full_version >= '3.12'",
]
"""

ANSIBLE_CORE_DOWN = """\
[[package]]
name = "ansible-core"
version = "2.19.10"
source = { registry = "https://pypi.org/simple" }
resolution-markers = [
    "python_full_version < '3.12'",
]

[[package]]
name = "ansible-core"
version = "2.21.1"
source = { registry = "https://pypi.org/simple" }
resolution-markers = [
    "python_full_version >= '3.12'",
]
"""


def _parse(text: str) -> dict:
    """Parse lockfile TOML text.

    Args:
        text: uv.lock document contents.

    Returns:
        Parsed TOML dictionary.
    """
    return tomllib.loads(text)


class FindDowngradesTests(unittest.TestCase):
    """Tests for find_downgrades()."""

    def test_no_change(self) -> None:
        """Equal lockfiles produce no downgrades."""
        base = _lock(RUFF_014, MYPY_117)
        head = _lock(RUFF_014, MYPY_117)
        assert find_downgrades(_parse(base), _parse(head)) == []

    def test_upgrade_ok(self) -> None:
        """Version increases are allowed."""
        base = _lock(RUFF_010, MYPY_110)
        head = _lock(RUFF_014, MYPY_117)
        assert find_downgrades(_parse(base), _parse(head)) == []

    def test_direct_downgrade_fails(self) -> None:
        """A direct dependency version decrease is reported."""
        base = _lock(RUFF_014, MYPY_117)
        head = _lock(RUFF_010, MYPY_117)
        downs = find_downgrades(_parse(base), _parse(head))
        assert len(downs) == 1
        assert downs[0].key.name == "ruff"
        assert downs[0].base_version == "0.14.3"
        assert downs[0].head_version == "0.10.0"

    def test_transitive_ignored_by_default(self) -> None:
        """Transitive package downgrades are ignored in direct-only mode."""
        base = _lock(RUFF_014, MYPY_117, TRANSITIVE_NEW)
        head = _lock(RUFF_014, MYPY_117, TRANSITIVE_OLD)
        assert find_downgrades(_parse(base), _parse(head)) == []

    def test_transitive_checked_when_requested(self) -> None:
        """Transitive package downgrades are reported with direct_only=False."""
        base = _lock(RUFF_014, MYPY_117, TRANSITIVE_NEW)
        head = _lock(RUFF_014, MYPY_117, TRANSITIVE_OLD)
        downs = find_downgrades(
            _parse(base),
            _parse(head),
            direct_only=False,
        )
        assert len(downs) == 1
        assert downs[0].key.name == "click"

    def test_marker_specific_downgrade(self) -> None:
        """Multi-version packages compare matching resolution markers."""
        base = _lock(
            ANSIBLE_CORE_BASE,
            RUFF_014,
            root_deps=["ansible-core", "ruff"],
        )
        head = _lock(
            ANSIBLE_CORE_DOWN,
            RUFF_014,
            root_deps=["ansible-core", "ruff"],
        )
        downs = find_downgrades(_parse(base), _parse(head))
        assert len(downs) == 1
        assert downs[0].key.name == "ansible-core"
        assert downs[0].key.markers == ("python_full_version < '3.12'",)
        assert downs[0].base_version == "2.19.11"
        assert downs[0].head_version == "2.19.10"

    def test_format_report(self) -> None:
        """Report includes package names and escape-hatch guidance."""
        downs = find_downgrades(
            _parse(_lock(RUFF_014, MYPY_117)),
            _parse(_lock(RUFF_010, MYPY_117)),
        )
        report = format_report(downs)
        assert "ruff" in report
        assert "0.14.3 -> 0.10.0" in report
        assert "allow-lock-downgrade" in report


class MainCliTests(unittest.TestCase):
    """Tests for the CLI entry point."""

    def test_main_fails_on_downgrade(self) -> None:
        """CLI exits 1 when a downgrade is present."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "base.lock"
            head = Path(tmp) / "head.lock"
            base.write_text(_lock(RUFF_014, MYPY_117), encoding="utf-8")
            head.write_text(_lock(RUFF_010, MYPY_117), encoding="utf-8")
            code = main(["--base", str(base), "--head", str(head)])
            assert code == 1

    def test_main_allow_downgrade(self) -> None:
        """CLI exits 0 when --allow-downgrade is set."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "base.lock"
            head = Path(tmp) / "head.lock"
            base.write_text(_lock(RUFF_014, MYPY_117), encoding="utf-8")
            head.write_text(_lock(RUFF_010, MYPY_117), encoding="utf-8")
            code = main([
                "--base",
                str(base),
                "--head",
                str(head),
                "--allow-downgrade",
            ])
            assert code == 0

    def test_main_ok(self) -> None:
        """CLI exits 0 when lockfiles match."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "base.lock"
            head = Path(tmp) / "head.lock"
            content = _lock(RUFF_014, MYPY_117)
            base.write_text(content, encoding="utf-8")
            head.write_text(content, encoding="utf-8")
            code = main(["--base", str(base), "--head", str(head)])
            assert code == 0

    def test_main_missing_lockfile(self) -> None:
        """CLI exits 2 when a lockfile path does not exist."""
        with tempfile.TemporaryDirectory() as tmp:
            head = Path(tmp) / "head.lock"
            head.write_text(_lock(RUFF_014, MYPY_117), encoding="utf-8")
            with self.assertRaises(SystemExit) as ctx:
                main(["--base", str(Path(tmp) / "missing.lock"), "--head", str(head)])
            assert ctx.exception.code == 2

    def test_main_malformed_lockfile(self) -> None:
        """CLI exits 2 when a lockfile cannot be parsed."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "base.lock"
            head = Path(tmp) / "head.lock"
            base.write_text("not: valid: toml [[[", encoding="utf-8")
            head.write_text(_lock(RUFF_014, MYPY_117), encoding="utf-8")
            with self.assertRaises(SystemExit) as ctx:
                main(["--base", str(base), "--head", str(head)])
            assert ctx.exception.code == 2

    def test_main_github_step_summary(self) -> None:
        """CLI appends the downgrade report to GITHUB_STEP_SUMMARY."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "base.lock"
            head = Path(tmp) / "head.lock"
            summary = Path(tmp) / "summary.md"
            base.write_text(_lock(RUFF_014, MYPY_117), encoding="utf-8")
            head.write_text(_lock(RUFF_010, MYPY_117), encoding="utf-8")
            summary.write_text("existing\n", encoding="utf-8")
            with mock.patch.dict(
                "os.environ",
                {"GITHUB_STEP_SUMMARY": str(summary)},
            ):
                code = main([
                    "--base",
                    str(base),
                    "--head",
                    str(head),
                    "--allow-downgrade",
                    "--github-step-summary",
                ])
            assert code == 0
            text = summary.read_text(encoding="utf-8")
            assert text.startswith("existing\n")
            assert "### uv.lock downgrades detected" in text


class LockedVersionsTests(unittest.TestCase):
    """Tests for locked_versions() edge cases."""

    def test_unparsable_version_is_skipped_with_warning(self) -> None:
        """Invalid version strings are skipped and logged."""
        lock = _parse(
            _lock(
                """\
[[package]]
name = "ruff"
version = "not-a-version"
source = { registry = "https://pypi.org/simple" }
""",
                MYPY_117,
            )
        )
        with self.assertLogs("check_uv_lock_downgrades", level=logging.WARNING) as logs:
            versions = locked_versions(lock, only_names={"ruff", "mypy"})
        assert PackageKey("ruff", ()) not in versions
        assert any("not-a-version" in message for message in logs.output)


if __name__ == "__main__":
    unittest.main()
