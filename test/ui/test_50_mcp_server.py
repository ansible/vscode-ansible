"""Smoke tests for Ansible Development Tools MCP Server.

Tests cover: enable MCP server (via command or settings), verify MCP server
starts (success notification), and verify MCP server is usable (welcome page
shows MCP section). Full AI/Language Model integration is not exercised here.
"""

# pylint: disable=E0401, W0613, R0801
import time
from typing import Any

import pytest
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

from test.ui.utils.ui_utils import (
    ensure_vscode_ready,
    find_element_across_iframes,
    vscode_run_command,
)


def _assert_enable_notification(driver: Any) -> None:
    """Assert that a notification indicates MCP Server is enabled (or already enabled)."""
    notification = find_element_across_iframes(
        driver,
        "//*[contains(., 'MCP Server') and contains(., 'enabled')]",
        retries=10,
    )
    assert notification is not None, (
        "Expected notification that MCP Server is enabled or already enabled"
    )
    text = notification.text or notification.get_attribute("textContent") or ""
    assert "MCP Server" in text, (
        f"Expected MCP enable notification to mention 'MCP Server', got: {text!r}"
    )
    assert "enabled" in text, (
        f"Expected MCP enable notification to mention 'enabled', got: {text!r}"
    )


def _assert_disable_notification(driver: Any) -> None:
    """Assert that a notification indicates MCP Server is disabled (or already disabled)."""
    notification = find_element_across_iframes(
        driver,
        "//*[contains(., 'MCP Server') and contains(., 'disabled')]",
        retries=10,
    )
    assert notification is not None, (
        "Expected notification that MCP Server is disabled or already disabled"
    )
    text = notification.text or notification.get_attribute("textContent") or ""
    assert "MCP Server" in text, (
        f"Expected MCP disable notification to mention 'MCP Server', got: {text!r}"
    )
    assert "disabled" in text, (
        f"Expected MCP disable notification to mention 'disabled', got: {text!r}"
    )


def test_mcp_server_enable_via_command(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Enable MCP server via command and verify it starts (success notification)."""
    driver, _ = browser_setup
    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">ansible.mcpServer.enabled")
    time.sleep(2)
    _assert_enable_notification(driver)


def test_mcp_server_disable(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Disable MCP server via command and verify notification."""
    driver, _ = browser_setup
    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">ansible.mcpServer.disable")
    time.sleep(2)
    _assert_disable_notification(driver)


@pytest.mark.modify_settings({"ansible.mcpServer.enabled": True})
def test_mcp_server_enabled_via_settings(
    browser_setup: Any,
    modify_vscode_settings: Any,
    screenshot_on_fail: Any,
) -> None:
    """Enable MCP server via settings; run enable command and verify already-enabled notification."""
    driver, _ = browser_setup
    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">ansible.mcpServer.enabled")
    time.sleep(2)
    _assert_enable_notification(driver)


def test_mcp_server_usable(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Verify MCP server is usable: enable it, then confirm it appears in MCP server list."""
    driver, _ = browser_setup
    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">ansible.mcpServer.enabled")
    time.sleep(2)
    _assert_enable_notification(driver)

    # List MCP servers via command palette; our server must appear (packaging/registration check)
    vscode_run_command(driver, ">MCP: List Servers")
    time.sleep(2)  # allow quick pick to open

    server_in_list = find_element_across_iframes(
        driver,
        "//*[contains(text(), 'Ansible Development Tools MCP Server')]",
        retries=10,
    )
    assert server_in_list is not None, (
        "Ansible Development Tools MCP Server should appear in MCP server list when enabled"
    )

    # Dismiss the quick pick so it doesn't interfere with subsequent tests
    driver.switch_to.default_content()
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(0.5)
