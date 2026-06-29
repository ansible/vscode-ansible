#!/usr/bin/env python3
"""Validate SKILL.md frontmatter fields against spec + extended allowlist.

This hook is a **superset of skillmark E030**. Skillmark validates strictly
against the agentskills.io specification, which does not yet include fields
that major agent clients (Claude Code, VS Code Copilot) already support.

We disable E030 in ``.skillmark.toml`` and use this hook instead, which
allows both the spec fields and the emerging standard fields.

Spec fields (agentskills.io specification):
    https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx

Extended fields (supported by Claude Code and VS Code, proposed for spec):
    - ``user-invocable``: Controls slash-command menu visibility (default true)
    - ``argument-hint``: Autocomplete hint for skill arguments
    - ``disable-model-invocation``: Prevents agent auto-triggering
    - ``triggers``: Invocation phrases for skill discovery

References:
    - Claude Code: https://code.claude.com/docs/en/skills.md
    - VS Code:     https://code.visualstudio.com/docs/copilot/customization/agent-skills
    - Spec issue:  https://github.com/agentskills/agentskills/issues/105

Sunset plan:
    This script exists because the agentskills.io spec has not yet adopted
    the extended fields listed above.  Once the spec merges the proposal in
    issue #105 and skillmark's E030 recognizes the new fields, this script
    can be removed and E030 re-enabled in ``.skillmark.toml``.

Vendored from:
    https://github.com/ansible-community/ai-forge/blob/main/scripts/check_skill_frontmatter.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

_FRONTMATTER_PARTS = 3

_EXCLUDED_DIRS = {"node_modules", ".git", ".wdio-vscode", "dist", "out"}

# agentskills.io specification fields
_SPEC_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "description",
        "license",
        "compatibility",
        "metadata",
        "allowed-tools",
    }
)

# Fields supported by Claude Code / VS Code but not yet in the spec
_EXTENDED_FIELDS: frozenset[str] = frozenset(
    {
        "user-invocable",
        "argument-hint",
        "disable-model-invocation",
        "triggers",
    }
)

# Project-specific fields used by the SkillRegistry for discovery
_PROJECT_FIELDS: frozenset[str] = frozenset(
    {
        "category",
        "tags",
    }
)

_ALLOWED_FIELDS: frozenset[str] = _SPEC_FIELDS | _EXTENDED_FIELDS | _PROJECT_FIELDS

# Fields required in all skills
_REQUIRED_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "description",
    }
)

# Additional fields required only in agent-facing skills (.agents/skills/)
_AGENT_REQUIRED_FIELDS: frozenset[str] = frozenset(
    {
        "user-invocable",
    }
)


def extract_frontmatter(path: Path) -> dict[str, object] | None:
    """Return parsed frontmatter dict, or None if missing/invalid."""
    content = path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return None

    parts = content.split("---", 2)
    if len(parts) < _FRONTMATTER_PARTS:
        return None

    try:
        result = yaml.safe_load(parts[1])
    except yaml.YAMLError:
        return None
    if not isinstance(result, dict):
        return None
    return result


def check_skill(path: Path) -> list[str]:
    """Validate frontmatter fields for a single SKILL.md."""
    fm = extract_frontmatter(path)
    if fm is None:
        return [f"{path}: missing or invalid frontmatter"]

    errors = [
        f"{path}: unknown field '{field}'"
        for field in sorted(fm)
        if field not in _ALLOWED_FIELDS
    ]
    errors.extend(
        f"{path}: missing required field '{field}'"
        for field in sorted(_REQUIRED_FIELDS)
        if field not in fm
    )

    is_agent_skill = ".agents" in path.parts
    if is_agent_skill:
        errors.extend(
            f"{path}: missing required field '{field}'"
            for field in sorted(_AGENT_REQUIRED_FIELDS)
            if field not in fm
        )
    return errors


def find_skills(root: Path) -> list[Path]:
    """Find SKILL.md files, excluding vendored/build directories."""
    return sorted(
        p
        for p in root.glob("**/SKILL.md")
        if not any(excluded in p.parts for excluded in _EXCLUDED_DIRS)
    )


def main() -> int:
    """Check all SKILL.md files for valid frontmatter fields."""
    skill_files = find_skills(Path())

    if not skill_files:
        print("No SKILL.md files found")
        return 0

    all_errors: list[str] = []
    for skill_file in skill_files:
        all_errors.extend(check_skill(skill_file))

    if all_errors:
        print("Skill frontmatter errors:")
        for error in all_errors:
            print(f"  - {error}")
        return 1

    print(f"All {len(skill_files)} skills have valid frontmatter fields")
    return 0


if __name__ == "__main__":
    sys.exit(main())
