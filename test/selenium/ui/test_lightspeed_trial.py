"""This module is for testing the Ansible Lightspeed Trial functionality."""

# pylint: disable=E0401, W0613, R0801, W0603
from typing import Any

import pytest

from test.selenium.utils.ui_utils import vscode_login, vscode_trial_button

pytestmark = pytest.mark.lightspeed


PLAYBOOK_CONTENT = """
---
- name: example
  hosts: all
become: true

tasks:
- name: install dnsutils"""


@pytest.mark.vscode_trial
def test_vscode_trial_button(
    new_browser: Any,
    lightspeed_logout_teardown: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test the playbook explanation feature from vs-code."""
    # We use a function scoped browser because the connection is different
    driver, _, _ = new_browser

    vscode_login(driver, no_wca=True)
    # Ensure we get the Trial button
    assert vscode_trial_button(driver, "playbook.yaml", PLAYBOOK_CONTENT)
