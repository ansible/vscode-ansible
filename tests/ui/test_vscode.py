"""
This module is for testing vscode extension functionality
"""
# pylint: disable=E0401, W0613, R0801, W0603
import pytest
from dynaconf import settings

from utils.ui_utils import vscode_explanation
from utils.ui_utils import vscode_login
from utils.ui_utils import vscode_playbook_generation
from utils.ui_utils import vscode_prediction
from utils.ui_utils import vscode_role_generation
from utils.ui_utils import wait_displayed

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
        driver, "playbook.yaml", MULTI_SUGGESTIONS_PLAYBOOK, accept=False, mutil_provider=True
    )
    # validate the widget is working correctly
    wait_displayed(driver, "//span[contains(normalize-space(.), 'pilot')]", timeout=20)


@pytest.mark.on_prem
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

    if settings.ENV_FOR_DYNACONF in ["upstream", "downstream-25"]:
        # Our downstream-25 env points on an outdated IBM Cloud Pak
        expected_phrases = [
            "An error occurred attempting to complete your request. Please try again later."
        ]

    for phrase in expected_phrases:
        assert phrase in explanation, f"Error- missing expected phrase '{phrase}' from explanation"


@pytest.mark.on_prem
@pytest.mark.vscode
def test_vscode_playbook_generation(browser_setup, screenshot_on_fail):
    """
    test the playbook generation feature from vs-code
    """
    if settings.ENV_FOR_DYNACONF in ["upstream", "downstream-25"]:
        pytest.skip("Not supported by our current downstream-25 CI env")

    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # use generation
    steps, playbook = vscode_playbook_generation(driver, GENERATE_TASK)
    assert all(txt in steps for txt in ["Update"]), "Error- bad tasks"
    expected_playbook = ["- name: Update all RHEL machines", "hosts: all", "ansible.builtin"]
    assert all(txt in playbook for txt in expected_playbook), "Error- bad playbook"


@pytest.mark.on_prem
@pytest.mark.vscode
def test_vscode_role_generation(browser_setup, screenshot_on_fail):
    """
    test the role generation feature from vs-code
    """
    if settings.ENV_FOR_DYNACONF in ["upstream", "downstream-25"]:
        pytest.skip("Not supported by our current downstream-25 CI env")

    driver, _ = browser_setup

    if not logged_in_flag:
        vscode_login_wrapper(driver)
    # use generation
    steps, tasks = vscode_role_generation(driver, GENERATE_TASK)
    assert "RHEL" in steps
    assert "ansible.builtin.package" in tasks
