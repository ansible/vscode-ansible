"""Smoke tests for the LLM Provider Settings webview."""

# pylint: disable=E0401, W0613, R0801
from typing import Any

from test.ui.utils.ui_utils import (
    ensure_vscode_ready,
    find_element_across_iframes,
    vscode_run_command,
)


def test_llm_provider_webview_opens(
    browser_setup: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test that the LLM Provider Settings webview opens and renders."""
    driver, _ = browser_setup

    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">Ansible Lightspeed: Open LLM Provider Settings")

    find_element_across_iframes(
        driver,
        "//h1[text()='LLM Provider Settings']",
        retries=15,
    )


def test_llm_provider_webview_lists_providers(
    browser_setup: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test that all supported providers are listed in the webview."""
    driver, _ = browser_setup

    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">Ansible Lightspeed: Open LLM Provider Settings")

    find_element_across_iframes(
        driver,
        "//h1[text()='LLM Provider Settings']",
        retries=15,
    )

    wca_provider = find_element_across_iframes(
        driver,
        "//*[contains(@class, 'provider-name') and contains(., 'IBM watsonx')]",
        retries=10,
    )
    assert wca_provider is not None, "IBM watsonx provider should be listed"

    google_provider = find_element_across_iframes(
        driver,
        "//*[contains(@class, 'provider-name') and contains(., 'Google Gemini')]",
        retries=10,
    )
    assert google_provider is not None, "Google Gemini provider should be listed"


def test_llm_provider_webview_edit_button(
    browser_setup: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test that clicking Edit on a provider reveals the config form."""
    driver, _ = browser_setup

    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">Ansible Lightspeed: Open LLM Provider Settings")

    find_element_across_iframes(
        driver,
        "//h1[text()='LLM Provider Settings']",
        retries=15,
    )

    edit_button = find_element_across_iframes(
        driver,
        "//button[contains(@class, 'edit-btn')]",
        retries=10,
    )
    edit_button.click()

    find_element_across_iframes(
        driver,
        "//button[contains(., 'Save')]",
        retries=10,
    )
