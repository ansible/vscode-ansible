"""This module is a fixtures for the ui testing."""

# pylint: disable=E0401
import contextlib
import logging
import os
from collections.abc import Generator
from datetime import datetime
from typing import TYPE_CHECKING, Any

import pytest
from selenium import webdriver
from selenium.common import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver

if TYPE_CHECKING:
    from selenium.webdriver.common.options import ArgOptions

from test.selenium.hooks.logging_hook import phase_report_key
from test.selenium.utils.ui_utils import (
    TimeOutError,
    clear_text,
    close_all_tabs,
    redhat_logout,
)

# Initialize logging
log = logging.getLogger(__name__)


@pytest.fixture(scope="session")
def browser_setup() -> Generator[tuple[WebDriver, str], None, None]:
    """Create a browser instance.

    Yields:
        Tuple of (WebDriver instance, login URL)
    """
    browser = os.environ.get("BROWSER_TYPE")
    options: ArgOptions  # type: ignore[name-defined]
    if browser == "chrome":
        options = webdriver.ChromeOptions()
    else:
        options = webdriver.FirefoxOptions()
        options.set_preference("privacy.trackingprotection.enabled", False)  # noqa: FBT003
    options.add_argument("--ignore-ssl-errors=yes")
    options.add_argument("--ignore-certificate-errors")
    driver = webdriver.Remote(
        command_executor="http://localhost:4444/wd/hub",
        options=options,
    )
    driver.maximize_window()

    yield driver, "https://stage.ai.ansible.redhat.com/login"

    # Cleanup: close all tabs and quit the browser
    try:
        close_all_tabs(driver)
        driver.quit()
        log.info("Browser session closed successfully")
    except Exception as e:  # noqa: BLE001
        log.warning("Error during browser cleanup: %s", e)
        # Force quit even if cleanup fails
        with contextlib.suppress(Exception):
            driver.quit()


@pytest.fixture
def new_browser() -> Generator[tuple[WebDriver | None, str, None], None, None]:
    """Create a browser instance to be used in the function scope.

    Enhanced with robust cleanup for better session management.

    Yields:
        Tuple of (WebDriver instance or None, login URL, None)
    """
    browser = os.environ.get("BROWSER_TYPE")
    options: ArgOptions  # type: ignore[name-defined]
    if browser == "chrome":
        chrome_options = webdriver.ChromeOptions()
        options = chrome_options
    else:
        firefox_options = webdriver.FirefoxOptions()
        firefox_options.set_preference("privacy.trackingprotection.enabled", False)  # noqa: FBT003
        options = firefox_options
    options.add_argument("--ignore-ssl-errors=yes")
    options.add_argument("--ignore-certificate-errors")

    driver = None
    try:
        driver = webdriver.Remote(
            command_executor="http://localhost:4444/wd/hub", options=options
        )
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
                    except Exception:  # noqa: BLE001
                        pass  # Continue cleanup even if individual tab close fails

                # Quit the driver to properly terminate the session
                driver.quit()
                log.info("✓ Browser session properly closed")
            except Exception as e:  # noqa: BLE001
                log.warning("Warning during browser cleanup: %s", e)
                # Force quit even if regular cleanup fails
                with contextlib.suppress(Exception):
                    driver.quit()


@pytest.fixture(scope="module", autouse=True)
def reset_vscode_state(browser_setup: tuple[WebDriver, str]) -> Generator[None, None, None]:
    """Reset VSCode state between test modules to prevent state leakage.

    This fixture runs automatically at the start of each test module to ensure
    clean state, preventing issues where one test module's actions affect another.

    Yields:
        None - this fixture performs cleanup before and after module execution
    """
    driver, _ = browser_setup

    # Initial cleanup before module starts
    try:
        # Only clean if we're on VSCode
        if "127.0.0.1:8080" in driver.current_url:
            # Close any open panels/dialogs (settings, command palette, etc.)
            # Pressing Escape multiple times to close various UI elements
            for _ in range(5):
                ActionChains(driver).send_keys(Keys.ESCAPE).perform()

            driver.switch_to.default_content()
            log.debug("VSCode state reset before module execution")
    except Exception as e:  # noqa: BLE001
        log.warning("Error during pre-module VSCode state reset: %s", e)

    yield

    # Cleanup after module completes
    try:
        if "127.0.0.1:8080" in driver.current_url:
            # Close any open panels/dialogs
            for _ in range(5):
                ActionChains(driver).send_keys(Keys.ESCAPE).perform()

            driver.switch_to.default_content()
            log.debug("VSCode state reset after module execution")
    except Exception as e:  # noqa: BLE001
        log.warning("Error during post-module VSCode state reset: %s", e)


@pytest.fixture
def lightspeed_logout_teardown() -> Generator[Any, None, None]:
    """Fixture to log-out from lightspeed.

    Yields:
        Function to append driver instances for cleanup
    """
    drivers: list[WebDriver] = []
    yield drivers.append
    if drivers:
        for driver in drivers:
            redhat_logout(driver)


@pytest.fixture
def clear_vscode_text() -> Generator[Any, None, None]:
    """Fixture to clear all text still present in the vscode editor.

    Yields:
        Function to append driver instances for cleanup
    """
    drivers: list[WebDriver] = []
    yield drivers.append
    if drivers:
        for driver in drivers:
            if "127.0.0.1:8080" in driver.current_url:
                with contextlib.suppress(TimeOutError):
                    clear_text(driver)


def take_screenshot(driver: WebDriver, name: str) -> str:
    """Take a screenshot."""
    file_name = "out/junit/" + (
        f"{name}_{datetime.now().strftime('%Y-%m-%d_%H_%M')}.png".replace(  # noqa: DTZ005
            "/",
            "_",
        ).replace("::", "__")
    )

    # Log context before taking screenshot
    try:
        current_url = driver.current_url
        log.info("Taking screenshot for test '%s' at URL: %s", name, current_url)
    except Exception:  # noqa: BLE001
        log.info("Taking screenshot for test '%s' (unable to get current URL)", name)

    try:
        driver.save_screenshot(f"{file_name}")
    except WebDriverException:
        driver.switch_to.parent_frame()
        driver.save_screenshot(f"{file_name}")
    return file_name


@pytest.fixture(autouse=False)
def screenshot_on_fail(request: pytest.FixtureRequest) -> Generator[None, None, None]:
    """A fixture to take a screenshot when test fails.

    Yields:
        None - this fixture performs cleanup after test execution
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
        file_name = take_screenshot(driver, request.node.name)
        log.info("screenshot taken: %s", file_name)
