"""Tests for VSCode walkthrough functionality."""

# pylint: disable=E0401, W0613, R0801
import time
from typing import Any

import pytest
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.ui import WebDriverWait

from test.selenium.utils.ui_utils import vscode_run_command, wait_displayed

# Walkthrough test data: [walkthrough_name, [expected_steps]]
WALKTHROUGHS = [
    [
        "Create an Ansible environment",
        [
            "Create an Ansible playbook",
            "tag in the status bar",
            "Install the Ansible environment package",
        ],
    ],
    [
        "Discover Ansible Development Tools",
        ["Create", "Test", "Deploy", "Where do I start"],
    ],
    [
        "Start automating with your first Ansible playbook",
        [
            "Enable Ansible Lightspeed",
            "Create an Ansible playbook project",
            "Create an Ansible playbook",
            "Save your playbook to a playbook project",
            "Learn more about playbooks",
        ],
    ],
]


def open_walkthrough(driver: Any, walkthrough_name: str) -> Any:
    """Open a specific walkthrough by name."""
    vscode_run_command(driver, ">Welcome: Open Walkthrough")
    ActionChains(driver).send_keys(walkthrough_name).send_keys(Keys.ENTER).perform()
    time.sleep(1)

    # Switch to default content and wait for walkthrough element
    driver.switch_to.default_content()

    try:
        element = WebDriverWait(driver, 3).until(
            expected_conditions.presence_of_element_located((
                By.XPATH,
                "//div[contains(@class, 'getting-started-category')]",
            ))
        )
    except TimeoutException as e:
        msg = f"Timeout waiting for walkthrough '{walkthrough_name}' to load"
        raise ValueError(msg) from e
    else:
        return element


@pytest.mark.vscode
@pytest.mark.parametrize(
    ("walkthrough_name", "expected_steps"),
    WALKTHROUGHS,
    ids=[
        "ansible_env",
        "discover_adt",
        "first_playbook",
    ],
)
def test_walkthrough(
    browser_setup: Any,
    screenshot_on_fail: Any,
    walkthrough_name: str,
    expected_steps: list[str],
) -> None:
    """Test that walkthrough opens and contains expected elements."""
    driver, _ = browser_setup

    # Navigate to VSCode if not already there
    if "127.0.0.1:8080" not in driver.current_url:
        driver.get("http://127.0.0.1:8080")
        wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=10)

    # Open the specific walkthrough
    walkthrough_element = open_walkthrough(driver, walkthrough_name)

    # Verify the title contains the walkthrough name
    title_text = walkthrough_element.text
    assert walkthrough_name in title_text, (
        f"Expected walkthrough title to contain '{walkthrough_name}', got: {title_text}"
    )

    # Verify at least one of the expected steps is present
    try:
        step_list_element = wait_displayed(
            driver,
            "//div[contains(@class, 'step-list-container')]",
            timeout=2,
        )
        step_text = step_list_element.text
        first_step = step_text.split("\n")[0] if step_text else ""

        assert first_step in expected_steps, (
            f"Expected first step to be one of {expected_steps}, got: {first_step}"
        )
    except Exception as e:
        msg = f"Failed to verify walkthrough steps: {e}"
        raise AssertionError(msg) from e
