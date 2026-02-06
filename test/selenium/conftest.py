"""pytest settings."""

# cspell: ignore modifyitems
from __future__ import annotations

import logging
import os
from functools import lru_cache

import pytest

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
