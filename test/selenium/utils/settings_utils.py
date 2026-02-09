"""Utilities for managing VS Code settings in tests.

Follows the same pattern as test/utils.ts for consistency.
"""

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
USER_SETTINGS_PATH = PROJECT_ROOT / ".vscode-test/user-data/User/settings.json"
ORIGINAL_SETTINGS_PATH = PROJECT_ROOT / "test/testFixtures/settings.json"


def ensure_settings(settings: dict[str, Any]) -> None:
    """Ensure specified settings are present in user settings file.

    Args:
        settings: Dictionary of setting keys to values
    """
    USER_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)

    current_settings: dict[str, Any] = {}
    if USER_SETTINGS_PATH.exists():
        try:
            with USER_SETTINGS_PATH.open(encoding="utf-8") as f:
                current_settings = json.load(f)
        except Exception as err:  # pylint: disable=broad-except  # noqa: BLE001
            log.warning("Failed to parse settings at %s: %s", USER_SETTINGS_PATH, err)

    changed_settings: dict[str, Any] = {}

    for key, value in settings.items():
        current_value = current_settings.get(key)
        if current_value != value:
            changed_settings[key] = value
            current_settings[key] = value

    if not changed_settings:
        return

    # Write updated settings back
    with USER_SETTINGS_PATH.open("w", encoding="utf-8") as f:
        json.dump(current_settings, f, indent=2)


def reset_settings() -> None:
    """Reset settings to original baseline from test/testFixtures/settings.json.

    Follows the same logic as resetSettings() in test/utils.ts
    """
    with ORIGINAL_SETTINGS_PATH.open(encoding="utf-8") as f:
        settings = json.load(f)
    ensure_settings(settings)
