"""Tests for VSCode walkthrough functionality."""

# pylint: disable=E0401, W0613, R0801

import time
from typing import Any

import pytest

from test.selenium.utils.ui_utils import (
    navigate_to_vscode_and_clean,
    vscode_run_command,
    wait_displayed,
)


@pytest.mark.vscode
def test_create_empty_playbook(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the 'Create an empty Ansible playbook' command."""
    driver, _ = browser_setup

    # Navigate to VSCode and close any welcome tabs
    navigate_to_vscode_and_clean(driver)

    vscode_run_command(driver, ">ansible.create-empty-playbook")

    wait_displayed(
        driver,
        "//div[contains(@class, 'tab') and contains(., 'Untitled')]",
        timeout=2,
    )

    time.sleep(1)
    view_lines = driver.find_elements("xpath", "//div[@class='view-line']")

    # Extract text from the lines (checking first 10 lines is sufficient)
    file_lines = [line.text for line in view_lines[:10] if line.text]
    assert len(file_lines) >= 3, f"Expected at least 3 lines, got {len(file_lines)}"
    assert any("playbook" in line.lower() for line in file_lines), (
        f"Expected playbook template content in lines: {file_lines}"
    )
