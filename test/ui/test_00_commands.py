"""Tests for VSCode walkthrough functionality."""

# pylint: disable=E0401, W0613, R0801

import logging
import time
from typing import Any

import pytest
from selenium.common import ElementNotInteractableException, NoSuchElementException
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.wait import WebDriverWait

from test.ui.utils.ui_utils import (
    ensure_vscode_ready,
    vscode_run_command,
    wait_displayed,
)

log = logging.getLogger(__package__)

EXPECTED_ADT_PACKAGES = [
    "ansible-core",
    "ansible-creator",
    "ansible-dev-environment",
    "ansible-dev-tools",
    "ansible-lint",
    "ansible-navigator",
    "ansible-sign",
    "molecule",
    "pytest-ansible",
    "tox-ansible",
]


@pytest.mark.skip(reason="Flaky on CI - tests container image, not extension code")
def test_terminal(
    browser_setup: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test terminal functionality."""
    driver, _ = browser_setup

    ensure_vscode_ready(driver)
    vscode_run_command(driver, ">workbench.action.terminal.new")
    vscode_run_command(driver, ">workbench.action.terminal.focus")
    time.sleep(5)  # allow terminal to start before sending input
    vscode_run_command(
        driver, ">workbench.action.terminal.sendSequence", "adt --version\\n"
    )

    output: WebElement | None = None

    def check_output() -> bool:
        nonlocal output
        output = driver.find_element(
            by="xpath", value="//div[@class='terminal-xterm-host']"
        )
        log.info("terminal output: %s", output.text)
        return "tox-ansible" in output.text

    errors = [NoSuchElementException, ElementNotInteractableException]
    wait = WebDriverWait(
        driver, timeout=30, poll_frequency=1, ignored_exceptions=errors
    )
    wait.until(lambda _: check_output())

    assert isinstance(output, WebElement)
    text = output.text
    missing = [pkg for pkg in EXPECTED_ADT_PACKAGES if pkg not in text]
    assert not missing, f"Missing packages in 'adt --version' output: {missing}"


@pytest.mark.skip(reason="Flaky on CI - extension activation timing issues")
def test_create_empty_playbook(
    browser_setup: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test the 'Create an empty Ansible playbook' command."""
    driver, _ = browser_setup

    ensure_vscode_ready(driver)

    vscode_run_command(driver, ">ansible.create-empty-playbook")

    wait_displayed(
        driver,
        "//div[contains(@class, 'tab') and contains(., 'Untitled')]",
        timeout=10,
    )

    time.sleep(2)
    view_lines = driver.find_elements("xpath", "//div[@class='view-line']")

    # Extract text from the lines (checking first 10 lines is sufficient)
    file_lines = [line.text for line in view_lines[:10] if line.text]
    assert len(file_lines) >= 3, f"Expected at least 3 lines, got {len(file_lines)}"
    assert any("playbook" in line.lower() for line in file_lines), (
        f"Expected playbook template content in lines: {file_lines}"
    )
