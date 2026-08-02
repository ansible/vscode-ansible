"""Fail when uv.lock downgrades direct dependency pins vs a base lockfile.

Compares locked package versions between a head uv.lock (PR branch) and a base
uv.lock (typically origin/main). By default only direct dependencies declared
under the root package's dependency groups are checked.

Exit codes:
  0 — no downgrades (or --allow-downgrade was set)
  1 — one or more downgrades detected
  2 — usage / parse error
"""

from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

import tomllib
from packaging.version import InvalidVersion, Version

ROOT_PACKAGE = "vscode-ansible"
logger = logging.getLogger(__name__)


@dataclass(frozen=True, order=True)
class PackageKey:
    """Identity for a locked package resolution."""

    name: str
    markers: tuple[str, ...]


@dataclass(frozen=True)
class Downgrade:
    """A package whose locked version decreased."""

    key: PackageKey
    base_version: str
    head_version: str

    def format(self) -> str:
        """Return a human-readable downgrade line.

        Returns:
            Formatted package downgrade description.
        """
        marker = f" [{', '.join(self.key.markers)}]" if self.key.markers else ""
        return f"{self.key.name}{marker}: {self.base_version} -> {self.head_version}"


def _load_lock(path: Path) -> dict:
    try:
        with path.open("rb") as handle:
            return tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        logger.exception("Failed to parse lockfile %s", path)
        raise SystemExit(2) from exc


def direct_dependency_names(lock: dict, root_package: str = ROOT_PACKAGE) -> set[str]:
    """Return direct dependency names from the root package metadata.

    Args:
        lock: Parsed uv.lock document.
        root_package: Name of the workspace root package.

    Returns:
        Set of direct dependency distribution names.
    """
    names: set[str] = set()
    for package in lock.get("package") or []:
        if package.get("name") != root_package:
            continue
        metadata = package.get("metadata") or {}
        requires_dev = metadata.get("requires-dev") or {}
        for deps in requires_dev.values():
            for dep in deps or []:
                name = dep.get("name")
                if name:
                    names.add(name)
        for dep in metadata.get("requires-dist") or []:
            name = dep.get("name") if isinstance(dep, dict) else None
            if name:
                names.add(name)
    return names


def locked_versions(
    lock: dict,
    *,
    only_names: set[str] | None = None,
) -> dict[PackageKey, Version]:
    """Map locked package keys to parsed versions.

    Args:
        lock: Parsed uv.lock document.
        only_names: Optional allow-list of package names.

    Returns:
        Mapping of package keys to locked versions.
    """
    result: dict[PackageKey, Version] = {}
    for package in lock.get("package") or []:
        name = package.get("name")
        version_raw = package.get("version")
        if not name or version_raw is None:
            continue
        if only_names is not None and name not in only_names:
            continue
        markers = tuple(package.get("resolution-markers") or [])
        key = PackageKey(name=name, markers=markers)
        try:
            version = Version(str(version_raw))
        except InvalidVersion:
            continue
        # Prefer first occurrence; uv.lock should not duplicate keys.
        result.setdefault(key, version)
    return result


def find_downgrades(
    base_lock: dict,
    head_lock: dict,
    *,
    direct_only: bool = True,
    root_package: str = ROOT_PACKAGE,
) -> list[Downgrade]:
    """Return downgrades of locked versions from base to head.

    Args:
        base_lock: Parsed base-branch uv.lock.
        head_lock: Parsed PR-branch uv.lock.
        direct_only: When True, only check direct dependencies.
        root_package: Name of the workspace root package.

    Returns:
        Sorted list of detected downgrades.

    Raises:
        SystemExit: If direct_only is set and no direct deps are found.
    """
    only_names: set[str] | None = None
    if direct_only:
        only_names = direct_dependency_names(base_lock, root_package) | (
            direct_dependency_names(head_lock, root_package)
        )
        if not only_names:
            msg = (
                f"No direct dependencies found for root package "
                f"{root_package!r} in either lockfile"
            )
            logger.error(msg)
            raise SystemExit(2)

    base_versions = locked_versions(base_lock, only_names=only_names)
    head_versions = locked_versions(head_lock, only_names=only_names)

    downgrades: list[Downgrade] = []
    for key, base_version in sorted(base_versions.items()):
        head_version = head_versions.get(key)
        if head_version is None:
            continue
        if head_version < base_version:
            downgrades.append(
                Downgrade(
                    key=key,
                    base_version=str(base_version),
                    head_version=str(head_version),
                )
            )
    return downgrades


def format_report(downgrades: list[Downgrade]) -> str:
    """Format downgrades for logs / PR comments.

    Args:
        downgrades: Detected downgrades.

    Returns:
        Markdown report body.
    """
    lines = [
        "### uv.lock downgrades detected",
        "",
        (
            "The following locked package versions decreased relative to "
            "the base branch:"
        ),
        "",
    ]
    lines.extend(f"- `{item.format()}`" for item in downgrades)
    lines.extend([
        "",
        (
            "If this rollback is intentional, add the maintainer-only "
            "`allow-lock-downgrade` label and re-run the "
            "**uv.lock downgrade gate** job."
        ),
    ])
    return "\n".join(lines)


def _read_lock_arg(value: str) -> dict:
    path = Path(value)
    if path.exists():
        return _load_lock(path)
    msg = f"Lockfile not found: {value}"
    logger.error(msg)
    raise SystemExit(2)


def build_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser.

    Returns:
        Configured argument parser.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base",
        required=True,
        help="Path to base uv.lock (e.g. from origin/main)",
    )
    parser.add_argument(
        "--head",
        required=True,
        help="Path to head uv.lock (PR branch)",
    )
    parser.add_argument(
        "--allow-downgrade",
        action="store_true",
        help="Report downgrades but exit 0 (escape hatch)",
    )
    parser.add_argument(
        "--transitive",
        action="store_true",
        help="Also check transitive packages (default: direct deps only)",
    )
    parser.add_argument(
        "--root-package",
        default=ROOT_PACKAGE,
        help=f"Root package name in the lockfile (default: {ROOT_PACKAGE})",
    )
    parser.add_argument(
        "--github-step-summary",
        action="store_true",
        help="Append a markdown report to $GITHUB_STEP_SUMMARY when set",
    )
    return parser


def _write_step_summary(report: str) -> None:
    summary_path = Path(sys.environ["GITHUB_STEP_SUMMARY"])
    with summary_path.open("a", encoding="utf-8") as handle:
        handle.write(report)
        handle.write("\n")


def main(argv: list[str] | None = None, stdout: TextIO = sys.stdout) -> int:
    """CLI entry point.

    Args:
        argv: Optional CLI arguments (defaults to sys.argv).
        stdout: Stream used for report output.

    Returns:
        Process exit code.
    """
    args = build_parser().parse_args(argv)
    base_lock = _read_lock_arg(args.base)
    head_lock = _read_lock_arg(args.head)

    downgrades = find_downgrades(
        base_lock,
        head_lock,
        direct_only=not args.transitive,
        root_package=args.root_package,
    )

    if not downgrades:
        stdout.write("No uv.lock direct-dependency downgrades detected.\n")
        return 0

    report = format_report(downgrades)
    stdout.write(f"{report}\n")

    if args.github_step_summary and "GITHUB_STEP_SUMMARY" in sys.environ:
        _write_step_summary(report)

    if args.allow_downgrade:
        stdout.write(
            "\nallow-lock-downgrade enabled; not failing the check.\n",
        )
        return 0
    return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    sys.exit(main())
