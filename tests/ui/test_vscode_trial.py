"""
This module is for testing the Ansible Lightspeed Trial functionality
"""
# pylint: disable=E0401, W0613, R0801, W0603
import pytest

from utils.ui_utils import EXPERIMENTAL_COMMAND
from utils.ui_utils import vscode_login
from utils.ui_utils import vscode_run_command
from utils.ui_utils import vscode_trial_button


PLAYBOOK_CONTENT = """
---
- name: example
  hosts: all
become: true

tasks:
- name: install dnsutils"""


@pytest.mark.vscode_trial
def test_vscode_trial_button(new_browser, lightspeed_logout_teardown, screenshot_on_fail):
    """
    test the playbook explanation feature from vs-code
    """
    # We use a function scoped browser because the connection is different
    driver, _, _ = new_browser

    vscode_login(driver, no_wca=True)
    vscode_run_command(driver, EXPERIMENTAL_COMMAND)
    # Ensure we get the Trial button
    assert vscode_trial_button(driver, "playbook.yaml", PLAYBOOK_CONTENT)
