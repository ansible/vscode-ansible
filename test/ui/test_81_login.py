"""This module is for testing the login process."""

# pylint: disable=E0401, W0613
import time
from typing import Any

import pytest

from test.ui.utils.ui_utils import (
    admin_portal_logout,
    click_and_wait,
    get_vscode_attribution,
    redhat_logout,
    sso_auth_flow,
    validate_links,
    vscode_login,
    vscode_prediction,
    wait_displayed,
)

pytestmark = pytest.mark.lightspeed


PLAYBOOK_CONTENT = """
---
- name: example
  hosts: all
become: true

tasks:
- name: install dnsutils"""


def test_login_page(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test that the login page is loaded and displayed correctly."""
    driver, login_url = browser_setup

    driver.get(login_url)

    title = driver.find_element(by="xpath", value="//h1")
    assert (
        title.text
        == "Log in to Red Hat Ansible Lightspeed with IBM watsonx Code Assistant"
    )

    body = driver.find_element(
        by="xpath",
        value="//*[contains(text(), 'You are currently not logged in.')]",
    )
    assert "Please log in using the button below." in body.text
    validate_links(
        driver,
        [
            (
                "https://access.redhat.com/documentation/en-us/"
                "red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant/2.x_latest/html/"
                "red_hat_ansible_lightspeed_with_ibm_watsonx_code_assistant_user_guide/index"
            ),
            "https://status.redhat.com/",
        ],
        "//div[@class='pf-l-level pf-m-gutter ls_bottom_menu']",
    )

    buttons = driver.find_elements(
        by="xpath",
        value="//a[contains(normalize-space(.), 'Log in with')]",
    )
    assert len(buttons) == 1, "ERROR- one login button is expected"
    for button in buttons:
        assert button.is_displayed()
        assert button.is_enabled()


def test_sso_auth_flow(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test redhat login flow."""
    driver, login_url = browser_setup

    driver.get(login_url)

    username_str = sso_auth_flow(driver)
    username = wait_displayed(
        driver,
        f"//p[contains(normalize-space(.), '{username_str}')]",
        timeout=60,
    )
    assert username.is_displayed(), "Error- username is not displayed correctly"
    roles = wait_displayed(
        driver,
        "//p[contains(normalize-space(.), 'Role')]",
        timeout=60,
    )
    assert "licensed user" in roles.text
    redhat_logout(driver)
    login_button = wait_displayed(driver, "//a[normalize-space(.)='Log in']")
    assert login_button.is_displayed()
    assert login_button.is_enabled()
    rh_button = click_and_wait(
        driver,
        login_button,
        "//a[normalize-space(.)='Log in with Red Hat']",
    )
    assert rh_button is not None
    assert rh_button.is_displayed()
    assert rh_button.is_enabled()


def test_admin_portal_error(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test that non-admin user can't get to the admin portal."""
    driver, _ = browser_setup
    # here we should not be logged in
    domain = "stage.ai.ansible.redhat.com"
    driver.get(f"https://{domain}/console/admin/settings")
    title = wait_displayed(driver, "//h1", timeout=10)
    assert (
        title.text
        == "Log in to Red Hat Ansible Lightspeed with IBM watsonx Code Assistant"
    )
    # now we log in validate we still can't get to the admin portal
    redhat_button = wait_displayed(
        driver,
        "//a[normalize-space(.)='Log in with Red Hat']",
    )
    redhat_button.click()
    # since we logged out, we need to go through RHSSO again
    assert "redhat.com/auth" in driver.current_url
    sso_auth_flow(driver)
    driver.get(f"https://{domain}/")
    wait_displayed(driver, "//p[contains(normalize-space(.), 'Role')]", timeout=10)
    driver.get(f"https://{domain}/console/admin/settings")
    title = wait_displayed(
        driver,
        "//section[@class='pf-v5-c-page__main-section']//h1",
        timeout=10,
    )
    assert title.text == "You currently do not have permissions to access this page."
    body = wait_displayed(
        driver,
        "//section[@class='pf-v5-c-page__main-section']//p",
        timeout=10,
    )
    assert (
        body.text
        == "Please contact your organization if you need to receive these permissions."
    )
    admin_portal_logout(driver)


def test_vscode_rhsso_auth_flow(
    browser_setup: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test redhat login that is initiated from vscode.

    Also test predictions and attributions from vscode.
    """
    driver, _ = browser_setup

    vscode_login(driver, device_login=True)
    vscode_prediction(driver, "playbook.yaml", PLAYBOOK_CONTENT)
    # validate prediction happened
    time.sleep(2)
    module = wait_displayed(driver, "(//div[@class='view-line']/span/span)[24]").text
    assert "ansible.builtin.package" in module
    # check that after accepting, the lightspeed message is gone
    playbook = wait_displayed(
        driver,
        "//div[@class='view-lines monaco-mouse-cursor-text']",
    ).text
    assert "# Content suggestion provided by Ansible Lightspeed" not in playbook
    console_button = wait_displayed(driver, "//div[@id='status.problems']")
    ansible_tab = click_and_wait(
        driver,
        console_button,
        "//a[@aria-label='Ansible' and @class='action-label']",
    )
    assert ansible_tab is not None
    ansible_tab.click()
    time.sleep(2)
    content_match = get_vscode_attribution(driver, "install dnsutils")
    assert len(content_match.keys()) == 3
    required_fields = ["url", "path", "source", "license", "score"]
    for attrib in content_match.values():
        assert all(attrib[field] for field in required_fields)
