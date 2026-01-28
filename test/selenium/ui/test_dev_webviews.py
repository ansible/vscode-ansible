"""Tests for content creator webviews (without ansible-creator)."""

# pylint: disable=E0401, W0613, R0801
from typing import Any

import pytest

from test.selenium.utils.ui_utils import (
    find_element_across_iframes,
    vscode_button_click,
    vscode_install_vsix,
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

    # Just navigate to VSCode and install VSIX - no need to open Ansible panel
    driver.get("http://127.0.0.1:8080")

    # Install the extension if needed
    vscode_install_vsix(driver)

    # Wait for VSCode to be ready
    wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=10)

    # Open the devfile creation webview
    vscode_run_command(driver, ">Ansible: Create a Devfile")

    # Wait for and verify the form is loaded
    find_element_across_iframes(driver, "//form[@id='devfile-form']", retries=10)

    # Check description text
    description = find_element_across_iframes(
        driver,
        "//div[@class='description-div']",
        retries=10,
    )
    description_text = description.text
    assert "Devfiles are yaml files" in description_text, (
        f"Expected description about Devfiles, got: {description_text}"
    )

    # Interact with path field
    vscode_textfield_interact(driver, "path-url", "~")

    # Interact with name field
    vscode_textfield_interact(driver, "devfile-name", "test")

    # Click create button
    vscode_button_click(driver, "create-button")

    # Toggle overwrite checkbox
    overwrite_checkbox = find_element_across_iframes(
        driver,
        "//vscode-checkbox[@id='overwrite-checkbox']",
        retries=10,
    )
    overwrite_checkbox.click()

    # Click create button again
    vscode_button_click(driver, "create-button")

    # Click clear logs button
    vscode_button_click(driver, "clear-logs-button")

    # Click reset button
    vscode_button_click(driver, "reset-button")

    # Test with different path
    vscode_textfield_interact(driver, "path-url", "~/test")
    vscode_textfield_interact(driver, "devfile-name", "test")
    vscode_button_click(driver, "create-button")

    # Toggle overwrite checkbox again
    overwrite_checkbox.click()
    vscode_button_click(driver, "create-button")

    # Final reset
    vscode_button_click(driver, "reset-button")


@pytest.mark.vscode
def test_create_devcontainer_webview_elements(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the devcontainer creation webview elements and workflow."""
    driver, _ = browser_setup

    # Just navigate to VSCode and install VSIX - no need to open Ansible panel
    driver.get("http://127.0.0.1:8080")

    # Install the extension if needed
    vscode_install_vsix(driver)

    # Wait for VSCode to be ready
    wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=10)

    # Open the devcontainer creation webview
    vscode_run_command(driver, ">Ansible: Create a Devcontainer")

    # Wait for and verify the form is loaded
    find_element_across_iframes(
        driver,
        "//form[@id='devcontainer-form']",
        retries=10,
    )

    # Check description text
    description = find_element_across_iframes(
        driver,
        "//div[@class='description-div']",
        retries=10,
    )
    description_text = description.text
    assert "Devcontainers are json files" in description_text, (
        f"Expected description about Devcontainers, got: {description_text}"
    )

    # Interact with path field
    vscode_textfield_interact(driver, "path-url", "~")

    # Click create button
    vscode_button_click(driver, "create-button")

    # Toggle overwrite checkbox
    overwrite_checkbox = find_element_across_iframes(
        driver,
        "//vscode-checkbox[@id='overwrite-checkbox']",
        retries=10,
    )
    overwrite_checkbox.click()

    # Click create button again
    vscode_button_click(driver, "create-button")

    # Click clear logs button
    vscode_button_click(driver, "clear-logs-button")

    # Click reset button
    vscode_button_click(driver, "reset-button")

    # Test with different path
    vscode_textfield_interact(driver, "path-url", "~/test")
    vscode_button_click(driver, "create-button")

    # Toggle overwrite checkbox again
    overwrite_checkbox.click()
    vscode_button_click(driver, "create-button")

    # Final reset
    vscode_button_click(driver, "reset-button")
