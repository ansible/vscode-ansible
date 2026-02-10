"""This module is a fixtures for the ui testing."""

# cspell: ignore capmanager capturemanager pluginmanager getplugin
# pylint: disable=E0401
import contextlib
import logging
import os
import subprocess
import time
from collections.abc import Generator
from datetime import datetime
from typing import TYPE_CHECKING, Any

import pytest
from selenium import webdriver
from selenium.common import WebDriverException
from selenium.webdriver.remote.webdriver import WebDriver

if TYPE_CHECKING:
    from _pytest.capture import CaptureManager
    from selenium.webdriver.common.options import ArgOptions

from test.selenium.hooks.logging_hook import phase_report_key
from test.selenium.utils.settings_utils import ensure_settings, reset_settings
from test.selenium.utils.ui_utils import (
    TimeOutError,
    clear_text,
    close_all_tabs,
    redhat_logout,
    vscode_run_command,
)

# Initialize logging
log = logging.getLogger(__name__)


@pytest.fixture(scope="session")
def browser_setup(
    request: pytest.FixtureRequest,
) -> Generator[tuple[WebDriver, str], None, None]:
    """Create a browser instance.

    Yields:
        Tuple of (WebDriver instance, login URL)
    """
    capmanager: CaptureManager = request.config.pluginmanager.getplugin(
        "capturemanager"
    )  # type: ignore[name-defined]
    log.info(
        "Starting selenium server at http://localhost:4444 and vnc://localhost:5999"
    )
    with capmanager.global_and_fixture_disabled():
        subprocess.run(
            "podman-compose up --remove-orphans --timeout 5 -d selenium-vscode",
            check=True,
            shell=True,
        )
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
    close_all_tabs(driver)


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


def _close_all_editors_without_saving(driver: WebDriver) -> None:
    """Close all editors and handle save dialog if it appears."""
    vscode_run_command(driver, ">View: Close All Editors")

    time.sleep(0.5)

    for elm in driver.find_elements(
        by="xpath",
        value='//*[normalize-space(.)="Don\'t Save"]',
    ):
        elm.click()


@pytest.fixture(autouse=False)
def close_editors(request: pytest.FixtureRequest) -> Generator[None, None, None]:
    """A fixture to close all editors without saving.

    Yields:
        None - this fixture performs cleanup after test execution
    """
    driver = None
    try:
        if "browser_setup" in request.fixturenames:
            driver, _ = request.getfixturevalue("browser_setup")
        elif "new_browser" in request.fixturenames:
            driver, _, _ = request.getfixturevalue("new_browser")
    except Exception:  # pylint: disable=broad-except  # noqa: BLE001
        # No browser fixture in this test, skip cleanup
        yield
        return

    if driver is None:
        yield
        return

    # Ensure VS Code is loaded before trying to close editors
    if "127.0.0.1:8080" not in driver.current_url:
        driver.get("http://127.0.0.1:8080")
        # Wait briefly for page to load
        time.sleep(1)

    _close_all_editors_without_saving(driver)

    yield

    _close_all_editors_without_saving(driver)


@pytest.fixture(autouse=False)
def modify_vscode_settings(
    request: pytest.FixtureRequest,
) -> Generator[None, None, None]:
    """Modify VS Code settings file before test and restore after."""
    marker = request.node.get_closest_marker("modify_settings")
    if not marker:
        yield
        return

    settings_updates = marker.args[0] if marker.args else {}
    if not settings_updates:
        yield
        return

    ensure_settings(settings_updates)
    time.sleep(1)

    yield

    # Restore to original baseline (same as test/utils.ts resetSettings)
    reset_settings()
    time.sleep(1)
