"""This module is a fixtures for the ui testing."""

# cspell: ignore capmanager capturemanager pluginmanager getplugin healthcheck
# pylint: disable=E0401
import contextlib
import logging
import os
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Generator
from datetime import datetime
from typing import TYPE_CHECKING, Any

import pytest
from selenium.common import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.remote.webdriver import WebDriver

from test.ui.conftest import _PROJECT_ROOT
from test.ui.const import CONTAINER_NAME

if TYPE_CHECKING:
    from _pytest.capture import CaptureManager

from test.ui.hooks.logging_hook import phase_report_key
from test.ui.utils.settings_utils import ensure_settings, reset_settings
from test.ui.utils.ui_utils import (
    TimeOutError,
    clear_text,
    close_all_tabs,
    redhat_logout,
    vscode_run_command,
)

# Initialize logging
log = logging.getLogger(__package__)


def is_container_healthy() -> bool:
    """Check if the selenium container is healthy."""
    result = subprocess.run(
        f"podman healthcheck run {CONTAINER_NAME}",
        shell=True,
        check=False,
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def _wait_for_code_server_http(
    url: str = "http://127.0.0.1:8080/",
    timeout_sec: int = 600,
) -> None:
    """Wait until code-server accepts HTTP (not covered by Selenium :4444 healthcheck).

    The compose file healthcheck only verifies Selenium Grid; code-server can still
    be starting, which otherwise leads to long WebDriver/page-load timeouts in CI.
    """
    deadline = time.time() + timeout_sec
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                if resp.status == 200:
                    log.info("code-server ready at %s (attempt %s)", url, attempt)
                    return
        except urllib.error.HTTPError as exc:
            # Upstream still starting — keep polling. Other responses mean HTTP is up.
            if exc.code in (502, 503, 504):
                pass
            else:
                log.info(
                    "code-server ready at %s (HTTP %s, attempt %s)",
                    url,
                    exc.code,
                    attempt,
                )
                return
        except (urllib.error.URLError, OSError, TimeoutError):
            pass
        if attempt <= 3 or attempt % 20 == 0:
            log.info("Waiting for code-server at %s: %s", url, attempt)
        time.sleep(2)
    pytest.fail(
        f"code-server did not become ready at {url} within {timeout_sec}s",
    )


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
    try:
        if not is_container_healthy():
            subprocess.run(
                f"podman rm -f {CONTAINER_NAME} 2>/dev/null || true",
                shell=True,
                check=False,
                text=True,
                capture_output=True,
            )
            log.info(
                "Starting selenium server at http://localhost:4444 and vnc://localhost:5999"
            )
            with capmanager.global_and_fixture_disabled():
                subprocess.run(
                    f"podman-compose up --force-recreate --quiet-pull --remove-orphans --timeout 5 -d {CONTAINER_NAME}",
                    check=True,
                    shell=True,
                    cwd=_PROJECT_ROOT,
                )
            health_deadline = time.time() + int(
                os.environ.get("UI_CONTAINER_HEALTH_TIMEOUT", "900"),
            )
            count = 0
            while time.time() < health_deadline:
                if is_container_healthy():
                    break
                count += 1
                time.sleep(1)
                if count <= 5 or count % 15 == 0:
                    log.info(
                        "Waiting for container %s to be healthy: %s",
                        CONTAINER_NAME,
                        count,
                    )
            else:
                pytest.fail(
                    f"container {CONTAINER_NAME} did not become healthy in time",
                )

        _wait_for_code_server_http(
            timeout_sec=int(os.environ.get("UI_CODE_SERVER_TIMEOUT", "600")),
        )

        browser = os.environ.get("BROWSER_TYPE")
        options: FirefoxOptions | ChromeOptions
        if browser == "chrome":
            options = ChromeOptions()
        else:
            options = FirefoxOptions()
            options.set_preference("privacy.trackingprotection.enabled", False)  # noqa: FBT003
        options.add_argument("--ignore-ssl-errors=yes")
        options.add_argument("--ignore-certificate-errors")
        driver = WebDriver(
            command_executor="http://localhost:4444/wd/hub",
            options=options,
        )
        driver.set_page_load_timeout(300)
        driver.set_script_timeout(300)
        driver.maximize_window()

        yield driver, "https://stage.ai.ansible.redhat.com/login"
        close_all_tabs(driver)
    except subprocess.CalledProcessError as e:  # pragma: no cover
        # log.error("Error in browser_setup: %s", e)
        pytest.exit(f"Failed to setup test database: {e}", returncode=2)


@pytest.fixture
def new_browser() -> Generator[tuple[WebDriver | None, str, None], None, None]:
    """Create a browser instance to be used in the function scope.

    Enhanced with robust cleanup for better session management.

    Yields:
        Tuple of (WebDriver instance or None, login URL, None)
    """
    browser = os.environ.get("BROWSER_TYPE")
    options: ChromeOptions | FirefoxOptions
    if browser == "chrome":
        chrome_options = ChromeOptions()
        options = chrome_options
    else:
        firefox_options = FirefoxOptions()
        firefox_options.set_preference("privacy.trackingprotection.enabled", False)  # noqa: FBT003
        options = firefox_options
    options.add_argument("--ignore-ssl-errors=yes")
    options.add_argument("--ignore-certificate-errors")

    driver = None
    try:
        driver = WebDriver(
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
                    except (WebDriverException, TimeoutException):  # pragma: no cover
                        pass  # Continue cleanup even if individual tab close fails

                # Quit the driver to properly terminate the session
                driver.quit()
                log.info("✓ Browser session properly closed")
            except (WebDriverException, TimeoutException) as e:  # pragma: no cover
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
    except (WebDriverException, TimeoutException):  # pragma: no cover
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
    if "call" in report and report["call"].failed:
        try:
            driver = request.node.funcargs["browser_setup"][0]
        except KeyError:  # pragma: no cover
            driver = request.node.funcargs["new_browser"][0]
        file_name = take_screenshot(driver, request.node.name)
        log.info("screenshot taken: %s", file_name)


def _close_all_editors_without_saving(driver: WebDriver) -> None:
    """Close all editors and handle save dialog if it appears."""
    try:
        vscode_run_command(driver, ">View: Close All Editors")

        time.sleep(0.5)

        for elm in driver.find_elements(
            by="xpath",
            value='//*[normalize-space(.)="Don\'t Save"]',
        ):
            elm.click()
    except (WebDriverException, TimeoutException):  # pragma: no cover
        pass


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
    except (WebDriverException, TimeoutException):  # pragma: no cover
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


@pytest.fixture(scope="module", autouse=False)
def modify_vscode_settings(
    request: pytest.FixtureRequest,
) -> Generator[None, None, None]:
    """Modify VS Code settings file before tests and restore after."""
    marker = None
    for item in request.session.items:
        if hasattr(item, "module") and item.module == request.module:  # type: ignore[attr-defined]
            marker = item.get_closest_marker("modify_settings")
            if marker:
                break

    if not marker:
        yield
        return

    settings_updates = marker.args[0] if marker.args else {}
    if not settings_updates:
        yield
        return

    ensure_settings(settings_updates)
    time.sleep(3)

    yield

    reset_settings()
    time.sleep(2)
