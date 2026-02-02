"""Tests for VSCode extension functionality."""

# pylint: disable=E0401, W0613, R0801, W0603
import os
from typing import Any

import pytest

from test.selenium.utils.ui_utils import (
    find_element_across_iframes,
    vscode_explanation,
    vscode_login,
    vscode_playbook_generation,
    vscode_prediction,
    vscode_role_generation,
    vscode_run_command,
    wait_displayed,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("LIGHTSPEED_PASSWORD"),
    reason="LIGHTSPEED_PASSWORD environment variable is not defined",
)


GENERATE_TASK = """update all RHEL machines"""

PLAYBOOK_CONTENT = """
---
- name: example
  hosts: all
become: true

tasks:
- name: install dnsutils"""

MULTI_SUGGESTIONS_PLAYBOOK = """---
- name: Playbook
  hosts: all
tasks:
  - name: Install dnsutils"""
logged_in_flag = False


def vscode_login_wrapper(driver: Any) -> None:
    """Log in with VSCode at the scope of this file."""
    vscode_login(driver)
    global logged_in_flag  # noqa: PLW0603
    logged_in_flag = True


@pytest.mark.vscode
def test_vscode_widget(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test that the vs-code widget shows up and works correctly.

    Tests widget behavior when multiple suggestion extensions are installed.
    """
    driver, _ = browser_setup

    vscode_login_wrapper(driver)
    vscode_prediction(
        driver,
        "playbook.yaml",
        MULTI_SUGGESTIONS_PLAYBOOK,
        accept=False,
        mutil_provider=True,
    )
    # validate the widget is working correctly
    wait_displayed(
        driver,
        "//span[contains(normalize-space(.), 'pilot')]",
        timeout=20,
    )


@pytest.mark.vscode
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


@pytest.mark.vscode
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


@pytest.mark.vscode
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


@pytest.mark.vscode
def test_vscode_lightspeed_explorer(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the Lightspeed explorer view from VSCode."""
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)

    vscode_run_command(driver, ">Ansible: Focus on Ansible Lightspeed View")
    find_element_across_iframes(
        driver,
        # After https://github.com/tomershinhar/selenium-vscode-container/pull/16
        # is deployed
        # "//p[@class='user-content' and contains(normalize-space(.), 'Logged in as:')]",
        "//*[contains(normalize-space(.), 'Logged in as:')]",
    )
    find_element_across_iframes(
        driver,
        "//vscode-button[contains(normalize-space(.), 'Generate a playbook')]",
    )
    find_element_across_iframes(
        driver,
        "//vscode-button[contains(normalize-space(.), 'Explain the current playbook')]",
    )
    find_element_across_iframes(
        driver,
        "//vscode-button[contains(normalize-space(.), 'Generate a role')]",
    )
    find_element_across_iframes(
        driver,
        "//vscode-button[contains(normalize-space(.), 'Explain the current role')]",
    )
