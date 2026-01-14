"""
This module is for testing vscode extension functionality
"""

# pylint: disable=E0401, W0613, R0801, W0603
import os

import pytest

from tests.utils.ui_utils import vscode_explanation
from tests.utils.ui_utils import vscode_login
from tests.utils.ui_utils import vscode_playbook_generation
from tests.utils.ui_utils import vscode_prediction
from tests.utils.ui_utils import vscode_role_generation
from tests.utils.ui_utils import vscode_run_command
from tests.utils.ui_utils import wait_displayed
from tests.utils.ui_utils import find_element_across_iframes

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


def vscode_login_wrapper(driver):
    """a helper function to login with vscode at the scope of this file"""
    vscode_login(driver)
    global logged_in_flag
    logged_in_flag = True


@pytest.mark.vscode
def test_vscode_widget(browser_setup, screenshot_on_fail):
    """
    test that the vs-code widget is showing up and working as expected
    when multiple suggestion extensions are installed
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
    wait_displayed(driver, "//span[contains(normalize-space(.), 'pilot')]", timeout=20)


@pytest.mark.vscode
def test_vscode_playbook_explanation(browser_setup, screenshot_on_fail):
    """
    test the playbook explanation feature from vs-code
    """
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # write a playbook
    vscode_prediction(driver, "playbook.yaml", PLAYBOOK_CONTENT)
    # use explanation
    explanation = vscode_explanation(driver)
    assert explanation != "Loading the explanation for playbook.yaml", "Error- explanation timeout"
    expected_phrases = [
        "Summary:",
        "dnsutils",
        "Pre-requisites:",
        "Task Explanations:",
    ]

    expected_phrases = ["dnsutils"]

    for phrase in expected_phrases:
        assert phrase in explanation, f"Error- missing expected phrase '{phrase}' from explanation"


@pytest.mark.vscode
def test_vscode_playbook_generation(browser_setup, screenshot_on_fail):
    """
    test the playbook generation feature from vs-code
    """
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
def test_vscode_role_generation(browser_setup, screenshot_on_fail):
    """
    test the role generation feature from vs-code
    """
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # use generation
    steps, tasks = vscode_role_generation(driver, GENERATE_TASK)
    assert "RHEL" in steps
    assert "ansible.builtin.package" in tasks


@pytest.mark.vscode
def test_vscode_lightspeed_explorer(browser_setup, screenshot_on_fail):
    """
    test the role generation feature from vs-code
    """
    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)

    vscode_run_command(driver, ">Ansible: Focus on Ansible Lightspeed View")
    find_element_across_iframes(
        driver, "//div[@id='explorer-container' and contains(normalize-space(.), 'Logged in as:')]"
    )
    find_element_across_iframes(
        driver, "//vscode-button[contains(normalize-space(.), 'Generate a playbook')]"
    )
    find_element_across_iframes(
        driver, "//vscode-button[contains(normalize-space(.), 'Explain the current playbook')]"
    )
    find_element_across_iframes(
        driver, "//vscode-button[contains(normalize-space(.), 'Generate a role')]"
    )
    find_element_across_iframes(
        driver, "//vscode-button[contains(normalize-space(.), 'Explain the current role')]"
    )
