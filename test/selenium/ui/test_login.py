"""This module is for testing the login process."""

# pylint: disable=E0401, W0613
import os
import time
from typing import Any

import pytest

from test.selenium.utils.ui_utils import (
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

pytestmark = pytest.mark.skipif(
    not os.environ.get("LIGHTSPEED_PASSWORD"),
    reason="LIGHTSPEED_PASSWORD environment variable is not defined",
)


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


def test_unsubed_login(
    browser_setup: Any,
    lightspeed_logout_teardown: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test the login page for a user without subscription."""
    driver, login_url = browser_setup
    # here we should not be logged in
    driver.get(login_url)
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
    username = sso_auth_flow(driver, no_sub=True)
    # set logout as teardown
    lightspeed_logout_teardown(driver)
    wait_displayed(driver, f"//p[contains(normalize-space(.), '{username}')]")
    title = driver.find_element(by="xpath", value="//h1")
    assert (
        title.text == "Your organization doesn't have access to "
        "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant."
    )
    body = driver.find_elements(by="xpath", value="//p")
    i = 0
    assert (
        body[i].text == "Your organization doesn't have access to "
        "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant."
    )
    assert (
        body[i + 1].text
        == "Contact your Red Hat Organization's administrator for more information."
    )
    assert body[i + 2].text == username


def test_unsubed_admin_login(
    browser_setup: Any,
    lightspeed_logout_teardown: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test the login page for a user without subscription."""
    driver, login_url = browser_setup
    # here we should not be logged in
    driver.get(login_url)
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
    username = sso_auth_flow(driver, no_sub=True, admin_login=True)
    # set logout as teardown
    lightspeed_logout_teardown(driver)
    wait_displayed(driver, f"//p[contains(normalize-space(.), '{username}')]")
    title = driver.find_element(by="xpath", value="//h1")
    assert (
        title.text
        == "Your organization doesn't have access to Red Hat Ansible Lightspeed "
        "with IBM watsonx Code Assistant."
    )
    body = driver.find_elements(by="xpath", value="//p")
    i = 0
    assert (
        body[i].text
        == "Your organization doesn't have access to Red Hat Ansible Lightspeed with "
        "IBM watsonx Code Assistant."
    )
    assert (
        body[i + 1].text == "You do not have an Active subscription to Ansible "
        "Automation Platform which is required to use Red Hat Ansible Lightspeed "
        "with IBM watsonx Code Assistant."
    )
    assert body[i + 2].text == username
    assert body[i + 3].text == "Role: administrator"


def test_no_wca_user_login(
    browser_setup: Any,
    lightspeed_logout_teardown: Any,
    screenshot_on_fail: Any,
    close_editors: Any,
) -> None:
    """Test the login page for a user with subscribed org that does not have wca set-up."""
    driver, login_url = browser_setup
    # here we should not be logged in
    driver.get(login_url)
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
    username = sso_auth_flow(driver, no_wca=True)
    # set logout as teardown
    lightspeed_logout_teardown(driver)
    title = driver.find_element(by="xpath", value="//h1")
    body = driver.find_elements(by="xpath", value="//p")
    # wait for all required redirects happens before continue
    time.sleep(5)
    if driver.current_url.endswith("/trial/"):
        # Trial case
        assert title.text.startswith(
            "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
        )
        assert any(
            "Start a trial to Ansible Lightspeed with IBM watsonx Code Assistant"
            in i.text
            for i in body
        )
    else:
        wait_displayed(driver, f"//p[contains(normalize-space(.), '{username}')]")
        assert (
            title.text == "You are a licensed Red Hat Ansible Lightspeed with IBM "
            "watsonx Code Assistant user but your "
            "administrator has not configured the service for your organization.\n"
            "Contact your organization administrator to have them complete Red Hat "
            "Ansible Lightspeed with IBM watsonx Code Assistant configuration."
        )
        i = 0
        assert (
            body[i].text
            == "You are a licensed Red Hat Ansible Lightspeed with IBM watsonx Code Assistant "
            "user but your administrator has not configured the service for your organization."
        )
        assert (
            body[i + 1].text == "Contact your organization administrator to have them "
            "complete Red Hat Ansible Lightspeed "
            "with IBM watsonx Code Assistant configuration."
        )
        assert (
            body[i + 2].text
            == "Contact your Red Hat Organization's administrator for more information."
        )
        assert body[i + 3].text == username
        assert body[i + 4].text == "Role: licensed user"


def test_no_wca_admin_login(
    browser_setup: Any,
    lightspeed_logout_teardown: Any,
    screenshot_on_fail: Any,
) -> None:
    """Test the login page for an admin user with subscribed org that does not have wca set-up."""
    driver, login_url = browser_setup
    # here we should not be logged in
    driver.get(login_url)
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
    username = sso_auth_flow(driver, no_wca=True, admin_login=True)
    # set logout as teardown
    lightspeed_logout_teardown(driver)
    wait_displayed(driver, f"//p[contains(normalize-space(.), '{username}')]")
    title = driver.find_element(by="xpath", value="//h1")
    assert title.text == "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant"
    body = driver.find_elements(by="xpath", value="//p")
    if driver.current_url.endswith("/trial/"):
        # Trial case
        assert title.text.startswith(
            "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant",
        )
        assert any(
            "This will only apply to you and will not affect your organization."
            in i.text
            for i in body
        )
    else:
        i = 0
        assert (
            body[i].text == "You are a Red Hat organization administrator for "
            "Red Hat Ansible Lightspeed with IBM watsonx Code Assistant."
            " IBM watsonx Code Assistant"
            " model settings have not been configured for your organization. Click here "
            "to access the Red Hat Ansible Lightspeed with IBM watsonx Code Assistant "
            "admin portal to complete configuration."
        )
        assert body[i + 1].text == username
        assert body[i + 2].text == "Role: administrator, licensed user"


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
        "//a[normalize-space(.)='Log in with Ansible Automation Platform']",
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
    # playbook = get_vscode_file_text(driver)
    # assert all(text in playbook for text in ["ansible.builtin.package", "name: dnsutils"])
