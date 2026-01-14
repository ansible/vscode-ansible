"""pytest settings."""

import os

import pytest

pytest_plugins = [
    # For screenshot_on_fail - must be loaded before fixtures that import it
    "test.selenium.hooks.logging_hook",
    "test.selenium.fixtures",
    "test.selenium.fixtures.ui_fixtures",
]


def pytest_configure(config: pytest.Config) -> None:
    """Configure pytest and check required environment variables."""
    del config  # Unused parameter
    if "LIGHTSPEED_PASSWORD" not in os.environ or "LIGHTSPEED_USER" not in os.environ:
        pytest.exit(
            "LIGHTSPEED_USER or LIGHTSPEED_PASSWORD environment variables "
            "are not defined.",
        )
