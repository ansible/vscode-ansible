"""
This module is a fixtures for the ui testing
"""

# pylint: disable=E0401
import logging
import os
from datetime import datetime

import pytest
from selenium import webdriver
from selenium.common import WebDriverException

from tests.hooks.logging_hook import phase_report_key
from tests.utils.ui_utils import clear_text
from tests.utils.ui_utils import close_all_tabs
from tests.utils.ui_utils import redhat_logout
from tests.utils.ui_utils import TimeOutError

# Initialize logging
log = logging.getLogger(__name__)


@pytest.fixture(scope="session")
def browser_setup():
    """
    Create a browser instance
    """
    browser = os.environ.get("BROWSER_TYPE")
    if browser == "chrome":
        options = webdriver.ChromeOptions()
    else:
        options = webdriver.FirefoxOptions()
        options.set_preference("privacy.trackingprotection.enabled", False)
    options.add_argument("--ignore-ssl-errors=yes")
    options.add_argument("--ignore-certificate-errors")
    driver = webdriver.Remote(command_executor="http://localhost:4444/wd/hub", options=options)
    driver.maximize_window()

    yield driver, "https://stage.ai.ansible.redhat.com/login"
    close_all_tabs(driver)


@pytest.fixture(scope="function")
def new_browser():
    """
    Create a browser instance to be used in the function scope
    Enhanced with robust cleanup for better session management
    """
    browser = os.environ.get("BROWSER_TYPE")
    if browser == "chrome":
        options = webdriver.ChromeOptions()
    else:
        options = webdriver.FirefoxOptions()
        options.set_preference("privacy.trackingprotection.enabled", False)
    options.add_argument("--ignore-ssl-errors=yes")
    options.add_argument("--ignore-certificate-errors")

    driver = None
    try:
        driver = webdriver.Remote(command_executor="http://localhost:4444/wd/hub", options=options)
        driver.maximize_window()
        yield driver, "https://stage.ai.ansible.redhat.com/login", None
    finally:
        # Enhanced cleanup to ensure proper session termination
        if driver:
            try:
                # Close all tabs/windows
                for tab in driver.window_handles:
                    try:
                        driver.switch_to.window(tab)
                        driver.close()
                    except Exception:  # pylint: disable=broad-exception-caught
                        pass  # Continue cleanup even if individual tab close fails

                # Quit the driver to properly terminate the session
                driver.quit()
                log.info("✓ Browser session properly closed")
            except Exception as e:  # pylint: disable=broad-exception-caught
                log.warning("Warning during browser cleanup: %s", e)
                # Force quit even if regular cleanup fails
                try:
                    driver.quit()
                except Exception:  # pylint: disable=broad-exception-caught
                    pass


@pytest.fixture(scope="function")
def lightspeed_logout_teardown():
    """
    Fixture to log-out from lightspeed
    """
    drivers = []
    yield drivers.append
    if drivers:
        for driver in drivers:
            redhat_logout(driver)


@pytest.fixture(scope="function")
def clear_vscode_text():
    """
    Fixture to clear all text still present in the vscode editor
    """
    drivers = []
    yield drivers.append
    if drivers:
        for driver in drivers:
            if "127.0.0.1:8080" in driver.current_url:
                try:
                    clear_text(driver)
                except TimeOutError:
                    pass


def take_screenshot(driver, name):
    """
    takes a screenshot
    """
    file_name = f"{name}_{datetime.today().strftime('%Y-%m-%d_%H_%M')}.png".replace(
        "/", "_"
    ).replace("::", "__")
    try:
        driver.save_screenshot(f"{file_name}")
    except WebDriverException:
        driver.switch_to.parent_frame()
        driver.save_screenshot(f"{file_name}")


@pytest.fixture(scope="function", autouse=False)
def screenshot_on_fail(request):
    """
    a fixture to take a screenshot when test fails
    """
    yield
    # request.node is an "item" because we use the default
    # "function" scope
    request.node.stash[phase_report_key]

    report = request.node.stash[phase_report_key]
    if report["call"].failed:
        try:
            driver = request.node.funcargs["browser_setup"][0]
        except KeyError:
            driver = request.node.funcargs["new_browser"][0]
        take_screenshot(driver, request.node.name)
        log.info("screenshot taken")
