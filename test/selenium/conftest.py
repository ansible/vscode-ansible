"""pytest settings."""

# cspell: ignore modifyitems sessionstart sessionfinish exitstatus rimraf
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import pytest

# Project root (vscode-ansible), assuming conftest at test/selenium/conftest.py
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.WARNING)

pytest_plugins = [
    # For screenshot_on_fail - must be loaded before fixtures that import it
    "test.selenium.hooks.logging_hook",
    "test.selenium.fixtures",
    "test.selenium.fixtures.ui_fixtures",
]


@lru_cache(maxsize=1)
def skip_if_missing_lightspeed_credentials() -> bool:
    """Skip tests if LIGHTSPEED_PASSWORD or LIGHTSPEED_USER environment variables are not defined.

    Result is cached to avoid repeated environment variable lookups.
    """
    if "CI" in os.environ:
        result = False
    else:
        result = (
            "LIGHTSPEED_PASSWORD" not in os.environ
            or "LIGHTSPEED_USER" not in os.environ
        )
    if result:
        logger.warning(
            "LIGHTSPEED_PASSWORD or LIGHTSPEED_USER environment variables are not defined, this will make use skip all tests with lightspeed marker."
        )
    return result


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Automatically skip tests marked with 'lightspeed' if credentials are missing."""
    if skip_if_missing_lightspeed_credentials():
        skip_marker = pytest.mark.skip(
            reason="LIGHTSPEED_PASSWORD or LIGHTSPEED_USER environment variables are not defined."
        )
        for item in items:
            if "lightspeed" in item.keywords:
                item.add_marker(skip_marker)


def pytest_sessionstart(session: pytest.Session) -> None:
    """Prepare dirs and settings for UI/Selenium tests (replaces Taskfile rimraf/mkdir/cp)."""
    for dir_path in (
        _PROJECT_ROOT / "out" / "ui-selenium" / "logs",
        _PROJECT_ROOT / "out" / "ui-selenium" / "coder-logs",
    ):
        if dir_path.exists():
            shutil.rmtree(dir_path)
    for dir_path in (
        _PROJECT_ROOT / ".vscode-test" / "user-data" / "User",
        _PROJECT_ROOT / "out" / "ui-selenium" / "logs",
        _PROJECT_ROOT / "out" / "ui-selenium" / "coder-logs",
    ):
        dir_path.mkdir(parents=True, exist_ok=True)
    settings_src = _PROJECT_ROOT / "test" / "testFixtures" / "settings.json"
    settings_dst = (
        _PROJECT_ROOT / ".vscode-test" / "user-data" / "User" / "settings.json"
    )
    shutil.copy2(settings_src, settings_dst)


def pytest_sessionfinish(session: pytest.Session, exitstatus: pytest.ExitCode) -> None:
    """Teardown the selenium server after tests on CI."""
    subprocess.run("podman-compose stats --no-stream", check=False, shell=True)
    if os.environ.get("CI"):
        subprocess.run("podman-compose down", check=False, shell=True)
