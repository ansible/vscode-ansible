"""Tests for Ansible Development Tools welcome page."""

# pylint: disable=E0401, W0613, R0801
from typing import Any

import pytest

from test.selenium.utils.ui_utils import (
    find_element_across_iframes,
    vscode_run_command,
    wait_displayed,
)


@pytest.mark.vscode
@pytest.mark.modify_settings({"ansible.lightspeed.enabled": False})
def test_sidebar_nav(
    browser_setup: Any,
    modify_vscode_settings: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test sidebar navigation to welcome page."""
    driver, _ = browser_setup

    if "127.0.0.1:8080" not in driver.current_url:
        driver.get("http://127.0.0.1:8080")
        wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=60)

    vscode_run_command(driver, ">Ansible: Focus on Ansible Development Tools View")

    get_started_link = find_element_across_iframes(
        driver,
        "//a[contains(@title, 'Ansible Development Tools welcome page')]",
        retries=10,
    )
    assert get_started_link is not None, "Get started link should be present in sidebar"

    get_started_link.click()

    find_element_across_iframes(
        driver,
        "//h1[text()='Ansible Development Tools']",
        retries=20,
    )


@pytest.mark.vscode
def test_header_and_subtitle(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test welcome page displays correct header and subtitle."""
    driver, _ = browser_setup

    if "127.0.0.1:8080" not in driver.current_url:
        driver.get("http://127.0.0.1:8080")
        wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=60)

    find_element_across_iframes(
        driver,
        "//h1[text()='Ansible Development Tools']",
        retries=30,
    )

    header_title = find_element_across_iframes(
        driver,
        "//h1[text()='Ansible Development Tools']",
        retries=10,
    )
    assert header_title.text == "Ansible Development Tools", (
        f"Expected header 'Ansible Development Tools', got: {header_title.text}"
    )

    subtitle = find_element_across_iframes(
        driver,
        "//*[contains(@class, 'subtitle') and contains(@class, 'description')]",
        retries=10,
    )
    subtitle_text = subtitle.text
    assert "Create, test and deploy Ansible content" in subtitle_text, (
        f"Expected subtitle to contain 'Create, test and deploy Ansible content', "
        f"got: {subtitle_text}"
    )


@pytest.mark.vscode
def test_mcp_section(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test welcome page displays MCP Server section correctly."""
    driver, _ = browser_setup

    if "127.0.0.1:8080" not in driver.current_url:
        driver.get("http://127.0.0.1:8080")
        wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=60)

    start_section = find_element_across_iframes(
        driver,
        "//div[contains(@class, 'index-list') and contains(@class, 'start-container')]",
        retries=20,
    )
    assert start_section is not None, "Start section should be present"

    mcp_server_option = find_element_across_iframes(
        driver,
        "//*[contains(text(), 'Ansible Development Tools MCP Server (AI)')]",
        retries=10,
    )

    mcp_server_text = mcp_server_option.text
    assert "Ansible Development Tools MCP Server (AI)" in mcp_server_text, (
        f"Expected MCP Server text, got: {mcp_server_text}"
    )

    mcp_server_icon = find_element_across_iframes(
        driver,
        "//span[contains(@class, 'codicon-wand')]",
        retries=10,
    )
    assert mcp_server_icon is not None, "MCP Server icon should be present"

    mcp_server_description = find_element_across_iframes(
        driver,
        "//*[contains(text(), 'Provides native VS Code AI integration')]",
        retries=10,
    )
    description_text = mcp_server_description.text
    assert "Provides native VS Code AI integration" in description_text, (
        f"Expected VS Code AI integration description, got: {description_text}"
    )
