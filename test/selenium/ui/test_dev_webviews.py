"""Tests for content creator webviews (without ansible-creator)."""

# pylint: disable=E0401, W0613, R0801
from typing import Any

import pytest

from test.selenium.utils.ui_utils import (
    find_element_across_iframes,
    vscode_button_click,
    vscode_run_command,
    vscode_textfield_interact,
    wait_displayed,
)


@pytest.mark.vscode
def test_create_devfile_webview_elements(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the devfile creation webview elements and workflow."""
    driver, _ = browser_setup

    driver.get("http://127.0.0.1:8080")

    wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=10)

    vscode_run_command(driver, ">Ansible: Create a Devfile")

    find_element_across_iframes(driver, "//form[@id='devfile-form']", retries=10)

    vscode_textfield_interact(driver, "path-url", "~")

    vscode_textfield_interact(driver, "devfile-name", "test")

    vscode_button_click(driver, "create-button")

    overwrite_checkbox = find_element_across_iframes(
        driver,
        "//vscode-checkbox[@id='overwrite-checkbox']",
        retries=10,
    )
    overwrite_checkbox.click()

    vscode_button_click(driver, "create-button")

    vscode_button_click(driver, "clear-logs-button")

    vscode_button_click(driver, "reset-button")

    vscode_textfield_interact(driver, "path-url", "~/test")
    vscode_textfield_interact(driver, "devfile-name", "test")
    vscode_button_click(driver, "create-button")

    overwrite_checkbox.click()
    vscode_button_click(driver, "create-button")

    vscode_button_click(driver, "reset-button")


@pytest.mark.vscode
def test_create_devcontainer_webview_elements(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the devcontainer creation webview elements and workflow."""
    driver, _ = browser_setup

    driver.get("http://127.0.0.1:8080")

    wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=10)

    vscode_run_command(driver, ">Ansible: Create a Devcontainer")

    find_element_across_iframes(
        driver,
        "//form[@id='devcontainer-form']",
        retries=10,
    )

    vscode_textfield_interact(driver, "path-url", "~")

    vscode_button_click(driver, "create-button")

    overwrite_checkbox = find_element_across_iframes(
        driver,
        "//vscode-checkbox[@id='overwrite-checkbox']",
        retries=10,
    )
    overwrite_checkbox.click()

    vscode_button_click(driver, "create-button")

    vscode_button_click(driver, "clear-logs-button")

    vscode_button_click(driver, "reset-button")

    vscode_textfield_interact(driver, "path-url", "~/test")
    vscode_button_click(driver, "create-button")

    overwrite_checkbox.click()
    vscode_button_click(driver, "create-button")

    vscode_button_click(driver, "reset-button")
