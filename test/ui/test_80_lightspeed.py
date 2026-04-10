"""Tests for VSCode extension functionality."""

# pylint: disable=E0401, W0613, R0801, W0603
from typing import Any

import pytest

from test.ui.utils.ui_utils import (
    find_element_across_iframes,
    vscode_explanation,
    vscode_login,
    vscode_playbook_generation,
    vscode_prediction,
    vscode_role_generation,
    vscode_run_command_f1,
    wait_displayed,
)

pytestmark = pytest.mark.lightspeed


GENERATE_TASK = """update all RHEL machines"""

PLAYBOOK_CONTENT = """
---
- name: example
  hosts: all
become: true

tasks:
- name: install dnsutils"""

logged_in_flag = False


def vscode_login_wrapper(driver: Any) -> None:
    """Log in with VSCode at the scope of this file."""
    vscode_login(driver, device_login=True)
    global logged_in_flag  # noqa: PLW0603
    logged_in_flag = True


def test_vscode_playbook_explanation(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the playbook explanation feature from VSCode."""
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # write a playbook
    vscode_prediction(driver, "playbook.yaml", PLAYBOOK_CONTENT)
    # use explanation
    explanation = vscode_explanation(driver)
    timeout_msg = "Loading the explanation for playbook.yaml"
    assert explanation != timeout_msg, "Error- explanation timeout"
    expected_phrases = [
        "Summary:",
        "dnsutils",
        "Pre-requisites:",
        "Task Explanations:",
    ]

    expected_phrases = ["dnsutils"]

    for phrase in expected_phrases:
        msg = f"Error- missing expected phrase '{phrase}' from explanation"
        assert phrase in explanation, msg


def test_vscode_playbook_generation(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the playbook generation feature from VSCode."""
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # use generation
    steps, playbook = vscode_playbook_generation(driver, GENERATE_TASK)
    assert all(txt in steps for txt in ["Update"]), "Error- bad tasks"
    expected_playbook = [
        "- name: Update all RHEL machines",
        "hosts: all",
        "ansible.builtin",
    ]
    assert all(txt in playbook for txt in expected_playbook), "Error- bad playbook"


def test_vscode_role_generation(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the role generation feature from VSCode."""
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # use generation
    steps, tasks = vscode_role_generation(driver, GENERATE_TASK)
    assert "RHEL" in steps
    assert "ansible.builtin.package" in tasks


def test_vscode_lightspeed_explorer(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the Lightspeed explorer view from VSCode."""
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)

    vscode_run_command_f1(driver, "Ansible: Focus on Ansible Lightspeed View")
    # verify logged-in state via the Accounts menu
    accounts_button = wait_displayed(driver, "//a[@aria-label='Accounts']")
    accounts_button.click()
    wait_displayed(
        driver,
        "//*[contains(normalize-space(.), 'lightspeed-test-user')]",
        timeout=5,
    )
    find_element_across_iframes(
        driver,
        "//*[contains(normalize-space(.), 'Generate Playbook')]",
    )
    find_element_across_iframes(
        driver,
        "//*[contains(normalize-space(.), 'Explain Playbook')]",
    )
    find_element_across_iframes(
        driver,
        "//*[contains(normalize-space(.), 'Generate Role')]",
    )
    find_element_across_iframes(
        driver,
        "//*[contains(normalize-space(.), 'Explain Role')]",
    )
