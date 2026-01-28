"""UI testing utilities for Selenium-based tests."""

# pylint: disable=E0401
import contextlib
import os
import time
from collections.abc import Generator
from typing import Any

from selenium.common import (
    ElementClickInterceptedException,
    NoSuchElementException,
    NoSuchFrameException,
)
from selenium.common.exceptions import (
    ElementNotInteractableException,
    NoSuchWindowException,
    StaleElementReferenceException,
    TimeoutException,
    WebDriverException,
)
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.ui import WebDriverWait

USERNAME = os.environ.get("LIGHTSPEED_USER")
PASSWORD = os.environ.get("LIGHTSPEED_PASSWORD")

# Move cursor to the "Explain the playbook with Ansible Lightspeed" menu item.
# Note: The required number of DOWN key presses varies by VSCode version.
POSITION_OF_ANSIBLE_EXPLAIN = 9


class TimeOutError(Exception):
    """Exception for when wait exceeded timeout."""


def wait_displayed(driver: WebDriver, xpath: str, timeout: int = 10) -> WebElement:
    """Wait for element to be displayed.

    Args:
        driver: WebDriver instance
        xpath: XPath selector for the element
        timeout: Maximum time to wait in seconds

    Returns:
        The displayed WebElement

    Raises:
        TimeOutError: If element not displayed within timeout
    """
    wait = WebDriverWait(driver, timeout=timeout)
    elm = wait.until(
        expected_conditions.visibility_of_element_located((By.XPATH, xpath)),
    )
    if not elm:
        msg = f"timeout waiting for {xpath}"
        raise TimeOutError(msg)
    return elm


def click_and_wait(
    driver: WebDriver,
    element: WebElement,
    wait_for: str | None = None,
    timeout: int = 10,
) -> WebElement | None:
    """Click an element and wait for the next step.

    If wait_for is given it will wait for it to be displayed,
    otherwise it will wait as many seconds as given by timeout.

    Args:
        driver: WebDriver instance
        element: Element to click
        wait_for: Optional XPath to wait for after clicking
        timeout: Maximum time to wait in seconds

    Returns:
        The waited-for element if wait_for is provided, None otherwise

    Raises:
        TimeOutError: If click or wait times out
    """
    wait = WebDriverWait(driver, 30)
    wait.until(expected_conditions.element_to_be_clickable(element))

    start_time = time.time()

    def duration() -> float:
        return time.time() - start_time

    while True:
        try:
            element.click()
            break
        except (ElementClickInterceptedException, StaleElementReferenceException):
            # When there are fade out effects took some time, just wait and click again
            pass

        if duration() > timeout:
            msg = f"timeout trying to click on {element}"
            raise TimeOutError(msg)

    if wait_for:
        return wait_displayed(driver, wait_for, timeout=timeout)
    return None


def validate_links(driver: WebDriver, urls: list[str], parent_xpath: str) -> None:
    """Validate all links under given element.

    Args:
        driver: WebDriver instance
        urls: List of expected URLs
        parent_xpath: XPath of parent element containing links
    """
    links = driver.find_elements(by="xpath", value=parent_xpath + "/*")
    assert len(links) == len(urls), "Error- number of links is not as expected"
    for link in links:
        assert link.is_displayed()
        url = link.get_attribute("href")
        if url:
            assert url in urls, f"Error- {url} not found in {urls}"
            urls.remove(url)
    # urls should be empty here
    assert urls == [], (
        f"ERROR - one or more expected urls are missing from element {parent_xpath}"
    )


def user_is_auth(driver: WebDriver) -> bool:
    """Check if a user is already authenticated.

    Args:
        driver: WebDriver instance

    Returns:
        True if user is authenticated, False otherwise
    """
    elts = driver.find_elements(
        by="xpath",
        value=(
            "//div[normalize-space(.)='You can close this page now.'] | "
            "//button[text()='Log out'] | "
            "//h1[text()='Welcome to the Ansible Automation Platform'] | "
            "//div[@id='has_subscription'] | "
            # Device Flow - RHSSO only - no AAP support
            "//h1[normalize-space(.)='Device log in successful'] | "
            # Admin portal
            "//div[@id='user_name']"
        ),
    )
    return bool(elts)


def sso_auth_flow(  # noqa: PLR0913
    driver: WebDriver,
    username: str | None = USERNAME,
    password: str | None = PASSWORD,
    *,
    admin_login: bool = False,
    no_wca: bool = False,
    no_sub: bool = False,
) -> str:
    """Perform all the steps to log in with Red Hat SSO.

    We have many parameters because of tests in test_login.

    Args:
        driver: WebDriver instance
        username: Username for authentication
        password: Password for authentication
        admin_login: Whether this is an admin login
        no_wca: Whether to skip WCA
        no_sub: Whether to skip subscription
    """
    user = USERNAME
    password = PASSWORD

    assert user
    assert password

    fields = {
        # RHSSO
        "//input[@value='' and @id='username-verification']": user,
        "//input[@id='password']": password,
        # AAP
        "//input[@value='' and @id='pf-login-username-id' or @id='id_username']": username,
        "//input[@value='' and @id='pf-login-password-id' or @id='id_password']": password,
    }

    start_time = time.time()

    def duration() -> float:
        return time.time() - start_time

    def get_elements_to_click() -> Generator[WebElement, None, None]:
        return find_elements_across_iframes(
            driver,
            (
                # American cookies
                # Test it on https://consent-pref.trustarc.com/?type=redhat_co_slider_notrans_v2
                "//button[text()='Accept default'] | "
                # California cookies
                # Test it on https://consent-pref.trustarc.com/?type=redhatsliderccpa_notrans_v2
                "//button[text()='Accept Default'] | "
                # European cookies
                # Test it on https://consent-pref.trustarc.com/?type=redhatslider_v3
                "//a[text()='Agree and proceed with standard settings'] | "
                "//button[normalize-space(.)='Log in'] | "
                "//*[@id='login-show-step2'] | "
                # Red Hat's SSO asking if we authorize the app
                "//button[@value='Authorize'] | "
                # First button
                "//a[normalize-space(.)='Log in with Red Hat'] | "
                # Device Flow - Grant access
                "//input[@value='Grant access'] | "
                # Device Flow - Grant access (same button)
                "//input[@id='kc-login'] | "
                # AAP - first page
                "//a[normalize-space(.)='Log in with Ansible Automation Platform'] | "
                # AAP second auth screen
                "//input[@value='Authorize'] | "
                # AAP Login button
                "//button[normalize-space(.)='Log in' or normalize-space(.)='LOG IN']"
            ),
        )

    while not user_is_auth(driver):
        # Workaround for the Device Flow - Grant access page
        driver.execute_script(
            'a = document.getElementById("consent_blackbar"); if (a) {a.remove();}',
        )
        for elt in get_elements_to_click():
            with contextlib.suppress(
                ElementNotInteractableException,
                ElementClickInterceptedException,
                StaleElementReferenceException,
            ):
                elt.click()
        driver.switch_to.default_content()

        for f, v in fields.items():
            if not v:
                continue
            for elm in driver.find_elements(by="xpath", value=f):
                with contextlib.suppress(
                    ElementNotInteractableException,
                    ElementClickInterceptedException,
                    StaleElementReferenceException,
                ):
                    elm.send_keys(v)

        max_login_timeout = 90
        if duration() > max_login_timeout:
            msg = "timeout during the AAP login"
            raise TimeOutError(msg)
    return user


def redhat_logout(driver: WebDriver) -> None:
    """Log out from the lightspeed main landing page.

    Args:
        driver: WebDriver instance
    """
    logout_button = wait_displayed(driver, "//button[normalize-space(.)='Log out']")
    assert logout_button.is_displayed()
    assert logout_button.is_enabled()
    logout_button.click()


def admin_portal_logout(driver: WebDriver) -> None:
    """Log out from the admin portal.

    Args:
        driver: WebDriver instance
    """
    logout_dropdown = wait_displayed(
        driver,
        "//button[contains(normalize-space(.), 'lightspeed')]",
    )
    logout_button = click_and_wait(
        driver,
        logout_dropdown,
        "//button[contains(normalize-space(.), 'Logout')]",
    )
    if logout_button:
        logout_button.click()
    sso_logout_button = driver.find_element(
        by="xpath",
        value="//input[@id='kc-logout']",
    )
    sso_logout_button.click()
    wait_displayed(driver, "//a[normalize-space(.)='Log in']")


def vscode_login(
    driver: WebDriver,
    *,
    device_login: bool = False,
    **kwargs: Any,
) -> None:
    """Go through the login process to ansible and vscode.

    Args:
        driver: WebDriver instance
        device_login: Whether to use device login flow
        **kwargs: Additional arguments passed to sso_auth_flow
    """
    vscode_connect(driver, device_login=device_login)

    sso_auth_flow(driver, **kwargs)
    # switch back to vs-code
    driver.switch_to.window(driver.window_handles[0])
    # user is now logged in, get a prediction
    time.sleep(2)


def switch_vscode_ligthspeed_url(driver: WebDriver, new_url: str) -> WebElement:
    """Switch the lightspeed url in vscode using the UI.

    Args:
        driver: WebDriver instance
        new_url: New URL to set

    Returns:
        The URL input element
    """
    ActionChains(driver).key_down(Keys.CONTROL).send_keys(",").key_up(
        Keys.CONTROL,
    ).perform()
    search_settings = find_element_across_iframes(
        driver,
        "//textarea[@aria-label='Search settings']",
    )
    search_settings.send_keys("ansible.lightspeed.apiEndpoint")
    search_settings.send_keys(Keys.ENTER)
    url_input = wait_displayed(
        driver,
        "//input[@aria-label='ansible.lightspeed.apiEndpoint' or @aria-label='ansible.lightspeed.URL']",
        timeout=1,
    )
    url_input.click()
    url_input.clear()
    url_input.send_keys(new_url)
    return url_input


def get_connect_button(driver: WebDriver) -> WebElement:
    """Find and return the Connect button in VSCode's Ansible extension interface.

    This function implements a retry mechanism to handle common Selenium WebDriver issues:
    - Refreshes the page if the button is not found
    - Handles various Selenium exceptions including invalid session errors

    Args:
        driver: WebDriver instance

    Returns:
        The Connect button WebElement

    Raises:
        NoSuchElementException: If button not found after all retries
        TimeOutError: If finding element times out
        ValueError: If element search fails
        WebDriverException: For other WebDriver related errors
    """
    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            return find_element_across_iframes(
                driver,
                "//vscode-button[normalize-space(.)='Connect']",
                retries=10,
            )
        except (NoSuchElementException, TimeOutError, ValueError, WebDriverException):
            if attempt == max_attempts - 1:
                raise
            driver.refresh()
            time.sleep(5)  # Wait for page to reload
    msg = "Connect button not found"
    raise ValueError(msg)


def vscode_install_vsix(driver: WebDriver) -> None:
    """Install VSCode extension from VSIX file.

    Args:
        driver: WebDriver instance
    """
    max_attempts = 5
    for i in range(max_attempts):
        try:
            vscode_run_command(driver, ">Extensions: Install from VSix")
            vsix_file = wait_displayed(
                driver,
                "//span[text()='ansible-latest.vsix']",
                timeout=10,
            )
            vsix_file.click()
            info_box = find_element_across_iframes(
                driver,
                "//span[text()='Completed installing extension.']",
            )
            info_box.click()
            click_and_wait(
                driver,
                info_box,
                "//a[@aria-label='Clear Notification (Delete)']",
                timeout=10,
            )
        except (TimeoutException, TimeOutError, ElementClickInterceptedException):
            if i == max_attempts - 1:
                raise
        else:
            return


def vscode_connect(
    driver: WebDriver,
    *,
    user_menu: bool = False,
    device_login: bool = False,
    install_vsix: bool = True,
) -> None:
    """Go to the vscode ansible page and click the "connect" button.

    Args:
        driver: WebDriver instance
        user_menu: Whether to use the VSCode Auth provider menu
        device_login: Whether to use OAuth2 Device Flow
        install_vsix: Whether to install the VSIX extension
    """
    driver.get("http://127.0.0.1:8080")

    if install_vsix:
        vscode_install_vsix(driver)

    ansible_button = wait_displayed(driver, "//a[@aria-label='Ansible']", timeout=60)
    switch_vscode_ligthspeed_url(driver, "https://stage.ai.ansible.redhat.com/")

    if device_login:  # OAuth2 Device Flow
        # in this case, give time for the command input to load correctly
        vscode_run_command(driver, ">Ansible Lightspeed: Sign in with Red Hat")
    if user_menu:  # Use the VSCode Auth provider menu
        user_button = click_and_wait(
            driver,
            ansible_button,
            "//div[@aria-label='Accounts - Sign in requested']",
            timeout=10,
        )
        if user_button:
            connect_button = click_and_wait(
                driver,
                user_button,
                "//a[normalize-space(.)='Sign in with Ansible Lightspeed to use Ansible (1)']",
            )
            if connect_button:
                open_button = click_and_wait(
                    driver,
                    connect_button,
                    "//a[normalize-space(.)='Open']",
                    timeout=10,
                )
                if open_button:
                    open_button.click()
    else:
        ansible_button.click()
        connect_button = get_connect_button(driver)
        connect_button.click()
        driver.switch_to.default_content()
        allow_button = wait_displayed(
            driver,
            "//a[normalize-space(.)='Allow']",
            timeout=10,
        )
        open_button = click_and_wait(
            driver,
            allow_button,
            "//a[normalize-space(.)='Open']",
            timeout=10,
        )

        if open_button:
            open_button.click()
    driver.switch_to.window(driver.window_handles[-1])


def find_element_across_iframes(
    driver: WebDriver,
    xpath: str,
    retries: int = 3,
) -> WebElement:
    """Loop over all iframes and nested iframes and return first matching element.

    Args:
        driver: WebDriver instance
        xpath: XPath selector for the element
        retries: Number of retry attempts

    Returns:
        The first matching WebElement

    Raises:
        ValueError: If element not found after all retries
    """
    for _ in range(retries):
        driver.switch_to.default_content()
        with contextlib.suppress(NoSuchElementException):
            return driver.find_element(By.XPATH, xpath)
        iframes = driver.find_elements(By.XPATH, "//iframe")
        for iframe in iframes:
            driver.switch_to.default_content()
            driver.switch_to.frame(iframe)
            with contextlib.suppress(NoSuchElementException):
                return driver.find_element(By.XPATH, xpath)

            with contextlib.suppress(
                NoSuchElementException,
                NoSuchFrameException,
                StaleElementReferenceException,
            ):
                nested_iframes = driver.find_elements(By.XPATH, "//iframe")
                for ni in nested_iframes:
                    with contextlib.suppress(
                        NoSuchElementException,
                        NoSuchFrameException,
                        StaleElementReferenceException,
                    ):
                        driver.switch_to.frame(ni)
                        return driver.find_element(By.XPATH, xpath)
                    driver.switch_to.default_content()
            driver.switch_to.default_content()
        time.sleep(1)
    msg = f"element not found: {xpath}"
    raise ValueError(msg)


def find_elements_across_iframes(
    driver: WebDriver,
    xpath: str,
    retries: int = 3,
) -> Generator[WebElement, None, None]:
    """Loop over all iframes and nested iframes and yield matching elements.

    Args:
        driver: WebDriver instance
        xpath: XPath selector for elements
        retries: Number of retry attempts

    Yields:
        Matching WebElements
    """
    for _ in range(retries):
        with contextlib.suppress(
            NoSuchWindowException,
            NoSuchElementException,
            NoSuchFrameException,
            StaleElementReferenceException,
        ):
            driver.switch_to.default_content()
            yield from driver.find_elements(By.XPATH, xpath)
            iframes = driver.find_elements(By.XPATH, "//iframe")
            for iframe in iframes:
                driver.switch_to.default_content()
                driver.switch_to.frame(iframe)
                yield from driver.find_elements(By.XPATH, xpath)
                with contextlib.suppress(
                    WebDriverException,
                    NoSuchElementException,
                    NoSuchFrameException,
                    StaleElementReferenceException,
                ):
                    nested_iframes = driver.find_elements(By.XPATH, "//iframe")
                    for ni in nested_iframes:
                        driver.switch_to.frame(ni)
                        yield from driver.find_elements(By.XPATH, xpath)
                    driver.switch_to.default_content()
                    continue
            time.sleep(1)
        time.sleep(1)


def vscode_prediction(
    driver: WebDriver,
    file_name: str,
    playbook: str,
    *,
    accept: bool = True,
    mutil_provider: bool = False,
) -> tuple[WebElement, WebElement, WebElement, WebElement] | WebElement:
    """Make a prediction from vscode.

    Assumes that navigation and login already took place.
    Opens the file named file_name and inputs playbook to it,
    then presses ENTER and TAB.

    Args:
        driver: WebDriver instance
        file_name: Name of the file to open
        playbook: Playbook content to input
        accept: Whether to accept the prediction
        mutil_provider: Whether multiple providers are available

    Returns:
        Prediction preview element or tuple of elements if not accepting
    """
    # open up the explorer panel
    ActionChains(driver).key_down(Keys.CONTROL).key_down(Keys.SHIFT).send_keys(
        "e",
    ).perform()
    ActionChains(driver).key_up(Keys.CONTROL).key_up(Keys.SHIFT).perform()
    wait_displayed(driver, f"//span[text()='{file_name}']", timeout=10).click()
    # click the text area to be able to input
    clear_text(driver)
    wait_displayed(
        driver,
        "//div[@class='view-lines monaco-mouse-cursor-text']",
        timeout=60,
    ).click()
    lines = playbook.split("\n")
    # input the content with low-level interactions
    actions = ActionChains(driver)
    for index, line in enumerate(lines):
        actions.send_keys(line)
        actions.send_keys(Keys.ENTER)
        # Delay before last line is entered to ensure Enter key event handler triggered
        if index == len(lines) - 1:
            time.sleep(5)
        actions.perform()

    # give some time for prediction to be suggested
    if mutil_provider:
        prediction_preview = wait_displayed(
            driver,
            "//span[contains(normalize-space(.), 'pilot')]",
            timeout=60,
        )
    else:
        prediction_preview = wait_displayed(
            driver,
            "//span[contains(normalize-space(.), 'ansible.builtin.package')]",
            timeout=60,
        )
        # check that the lightspeed comment is also showing
        wait_displayed(
            driver,
            "(//*[contains(normalize-space(.), "
            "'# Content suggestion provided by Ansible Lightspeed')])",
        )
    if accept:
        actions.send_keys(Keys.TAB).perform()
    else:
        time.sleep(5)  # Workaround for AAP-35908
        actions.move_to_element_with_offset(prediction_preview, 10, 0).perform()
        time.sleep(1)
        prev_prediction = driver.find_element(by="xpath", value="(//li)[32]")
        next_prediction = driver.find_element(by="xpath", value="(//li)[34]")
        accept_button = driver.find_element(by="xpath", value="(//li)[35]")
        return prediction_preview, prev_prediction, next_prediction, accept_button
    return prediction_preview


def vscode_trial_button(
    driver: WebDriver,
    file_name: str,
    playbook: str,
) -> WebElement | None:
    """Return the Trial button.

    Args:
        driver: WebDriver instance
        file_name: Name of the file to open
        playbook: Playbook content to input

    Returns:
        The Trial button element or None
    """
    try:  # in case explorer is already open
        wait_displayed(driver, f"//span[text()='{file_name}']", timeout=1).click()
    except (TimeoutException, TimeOutError, ElementClickInterceptedException):
        # go to explorer
        explorer = wait_displayed(
            driver,
            "//a[contains(@aria-label, 'Explorer')]",
            timeout=60,
        )
        explorer.click()
        # open the playbook
        try:
            wait_displayed(driver, f"//span[text()='{file_name}']", timeout=60).click()
        except ElementClickInterceptedException:
            ActionChains(driver).move_to_element(explorer).move_by_offset(
                0,
                50,
            ).perform()
            wait_displayed(driver, f"//span[text()='{file_name}']", timeout=60).click()
    # click the text area to be able to input
    clear_text(driver)
    wait_displayed(
        driver,
        "//div[@class='view-lines monaco-mouse-cursor-text']",
        timeout=60,
    ).click()
    lines = playbook.split("\n")
    # input the content with low-level interactions
    actions = ActionChains(driver)
    for line in lines:
        actions.send_keys(line)
        actions.send_keys(Keys.ENTER)
        actions.perform()
    max_attempts = 4
    for n in range(max_attempts):
        vscode_run_command(driver, ">Ansible Lightspeed: Inline suggestion trigger")
        time.sleep(0.5)
        try:
            return wait_displayed(
                driver,
                "//a[contains(text(), 'Start a trial')]",
                timeout=10,
            )
        except TimeoutException:
            if n == max_attempts - 1:
                raise
    return None


def clear_text(driver: WebDriver) -> None:
    """Clear all the text in the vscode text code editor.

    This should be used as a teardown when running multiple prediction tests.

    Args:
        driver: WebDriver instance
    """
    # click the text area to be able to input
    wait_displayed(
        driver,
        "//div[@class='view-lines monaco-mouse-cursor-text']",
        timeout=60,
    ).click()
    actions = ActionChains(driver)
    actions.key_down(Keys.CONTROL).send_keys("a").key_up(Keys.CONTROL).perform()
    actions.send_keys(Keys.BACKSPACE).perform()


def close_all_tabs(driver: WebDriver) -> None:
    """Close all the open tabs and interact with the save dialog.

    Args:
        driver: WebDriver instance
    """
    for _ in find_elements_across_iframes(driver, "//a[@aria-label='Close (Ctrl+W)']"):
        ActionChains(driver).key_down(Keys.CONTROL).send_keys("w").key_up(
            Keys.CONTROL,
        ).perform()
        for elm in driver.find_elements(
            by="xpath",
            value='//a[normalize-space(.)="Don\'t Save"]',
        ):
            elm.click()


def vscode_explanation(driver: WebDriver) -> str:
    """Get an explanation from vscode.

    Assumes that navigation and login already took place.
    Opens the file and goes through the UI process to get an explanation.

    Args:
        driver: WebDriver instance

    Returns:
        The explanation text
    """
    # click the text area to be able to input
    text_window = wait_displayed(
        driver,
        "//div[@class='view-lines monaco-mouse-cursor-text']",
        timeout=60,
    )
    text_window.click()
    # right-click
    actions = ActionChains(driver)
    actions.context_click(text_window).perform()

    # Move cursor to the "Explain the playbook with Ansible Lightspeed" menu item.
    # Note: The required number of DOWN key presses varies by VSCode version.
    # Update the following line if VSCode's context menu items change.
    for _ in range(POSITION_OF_ANSIBLE_EXPLAIN):
        actions.send_keys(Keys.DOWN)

    actions.send_keys(Keys.ENTER)
    actions.perform()
    time.sleep(20)
    # move to new iframe
    # NOTE: If the test fails at this point (Explain panel doesn't appear),
    # the context menu position likely changed in a VSCode update.
    # To fix: Right-click an Ansible YAML file in VSCode, count DOWN key presses
    # needed to reach "Explain the playbook with Ansible Lightspeed" (starting from 1),
    # then update POSITION_OF_ANSIBLE_EXPLAIN above with that number.
    driver.switch_to.frame(
        driver.find_element(By.XPATH, "//iframe[@class='webview ready']"),
    )
    # move to new iframe again
    driver.switch_to.frame(
        driver.find_element(By.XPATH, "//iframe[@title='Explanation']"),
    )
    explanation_elem = wait_displayed(driver, "//div[@class='explanation']", timeout=15)
    explanation = explanation_elem.text

    close_all_tabs(driver)
    return explanation


def vscode_playbook_generation(driver: WebDriver, task: str) -> tuple[str, str]:
    """Make a playbook generation from vscode.

    Assumes that navigation and login already took place.
    Goes through all the generation process and returns
    when the generated playbook is reached.

    Args:
        driver: WebDriver instance
        task: Task description for generation

    Returns:
        Tuple of (steps, playbook) text
    """
    # run gen command
    vscode_run_command(driver, ">Ansible Lightspeed: Playbook generation")
    title = find_element_across_iframes(
        driver,
        "//h2[contains(text(), 'Create a playbook with Ansible Lightspeed')]",
    )

    assert title.text == "Create a playbook with Ansible Lightspeed"
    message = wait_displayed(driver, "//div[@class='promptContainer']/label")
    expected_msg = "Describe what you want to achieve in natural language"
    assert message.text == expected_msg
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "1 of 3"
    # first step
    txt_input = wait_displayed(driver, "//div[@id='PromptTextField']/input")
    txt_input.send_keys(task)
    submit_button = wait_displayed(
        driver,
        "//vscode-button[normalize-space(.)='Analyze']",
    )
    submit_button.click()
    # second step
    message = wait_displayed(driver, "//h4", timeout=600)
    expected_msg2 = "Review the suggested steps for your playbook and modify as needed."
    assert message.text == expected_msg2
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "2 of 3"
    steps_elm = wait_displayed(driver, "//textarea[@id='outline-field']")
    steps = steps_elm.get_attribute("value")
    gen_button = wait_displayed(
        driver,
        "//vscode-button[normalize-space(.)='Continue']",
    )
    gen_button.click()
    # third step
    page = wait_displayed(driver, "//div[@id='page-number']", timeout=60)
    assert page.text == "3 of 3"
    playbook = wait_displayed(driver, "//code").text
    editor_button = wait_displayed(
        driver,
        "//vscode-button[normalize-space(.)='Open editor']",
    )
    editor_button.click()
    # exit iframes and wait for playbook
    driver.switch_to.default_content()
    wait_displayed(
        driver,
        "//span[contains(normalize-space(.), 'tasks:')]",
        timeout=60,
    )
    x: str = ""
    if steps and playbook:
        x = playbook
    return steps or "", x


def vscode_role_generation(driver: WebDriver, task: str) -> tuple[str, str]:
    """Make a role generation from vscode.

    Assumes that navigation and login already took place.
    Goes through all the generation process and returns
    when the generated role is reached.

    Args:
        driver: WebDriver instance
        task: Task description for generation

    Returns:
        Tuple of (steps, tasks) text
    """
    # run gen command
    vscode_run_command(driver, ">Ansible Lightspeed: Role generation")
    title = find_element_across_iframes(
        driver,
        "//h2[contains(text(), 'Create a role with Ansible Lightspeed')]",
    )

    assert title.text == "Create a role with Ansible Lightspeed"
    message = wait_displayed(driver, "//div[@class='promptContainer']/label")
    expected_msg = "Describe what you want to achieve in natural language"
    assert message.text == expected_msg
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "1 of 3"
    # first step
    txt_input = wait_displayed(driver, "//div[@id='PromptTextField']/input")
    txt_input.send_keys(task)
    submit_button = wait_displayed(
        driver,
        "//vscode-button[normalize-space(.)='Analyze']",
    )
    submit_button.click()
    # second step
    message = wait_displayed(driver, "//h4", timeout=600)
    expected_msg2 = "Review the suggested steps for your role and modify as needed."
    assert message.text == expected_msg2
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "2 of 3"
    steps_elm = wait_displayed(driver, "//textarea[@id='outline-field']")
    steps = steps_elm.get_attribute("value")
    gen_button = wait_displayed(
        driver,
        "//vscode-button[normalize-space(.)='Continue']",
    )
    gen_button.click()
    # third step
    page = wait_displayed(driver, "//div[@id='page-number']", timeout=60)
    assert page.text == "3 of 3"
    wait_displayed(driver, "//vscode-button[normalize-space(.)='Save files']")
    code_block = driver.find_elements(by="xpath", value="//code")[0]
    tasks = code_block.text
    return steps or "", tasks or ""


def get_vscode_file_text(driver: WebDriver) -> str:
    """Get the text currently displayed in the file open by vscode.

    Args:
        driver: WebDriver instance

    Returns:
        The file text content
    """
    playbook = ""
    words = driver.find_elements(
        by="xpath",
        value="//div[@class='view-line']/span/span",
    )
    for word in words:
        text = word.text
        playbook += text
    return playbook


def vscode_run_command(driver: WebDriver, command: str) -> None:
    """Run a command on vscode.

    Args:
        driver: WebDriver instance
        command: Command to run (will be prefixed with '>' if not present)
    """
    driver.switch_to.default_content()
    if not command.startswith(">"):
        command = ">" + command
    # click the command box
    max_attempts = 4
    command_input = None
    for i in range(max_attempts):
        try:
            command_box = find_element_across_iframes(
                driver,
                "//li[@class='action-item command-center-center']",
            )
            command_input = click_and_wait(
                driver,
                command_box,
                "//input[@aria-controls='quickInput_list']",
                timeout=1,
            )
            break
        except (
            TimeoutException,
            TimeOutError,
            NoSuchElementException,
            StaleElementReferenceException,
        ):
            if i == max_attempts - 1:
                raise
            time.sleep(1)

    if command_input:
        command_input.send_keys(command)
    # enter
    actions = ActionChains(driver)
    actions.send_keys(Keys.ENTER).perform()


def get_vscode_attribution(driver: WebDriver, prompt: str) -> dict[str, dict[str, str]]:
    """Return a dict for the attribution that is currently displayed.

    Note that the attribution needs to be in the view already before
    calling this function.

    Args:
        driver: WebDriver instance
        prompt: The prompt to verify

    Returns:
        Dictionary mapping summary to attribution details
    """
    # switch to iframe
    find_element_across_iframes(driver, "//summary")
    summary = []
    for elm in driver.find_elements(by="xpath", value="//summary"):
        elm.click()
        time.sleep(0.5)
        summary.append(elm.text)
    # summary = [elm.text for elm in driver.find_elements(by="xpath", value="//summary")]
    # verify this is the correct prompt
    assert summary, "Error- no attribution found"
    assert summary[0] == prompt
    del summary[0]
    urls = [
        elm.text for elm in driver.find_elements(by="xpath", value="//details//ul/li/a")
    ]
    paths = [
        elm.text
        for elm in driver.find_elements(
            by="xpath",
            value="//details//ul/li[contains(text(), 'Path: ')]",
        )
    ]
    sources = [
        elm.text
        for elm in driver.find_elements(
            by="xpath",
            value="//details//ul/li[contains(text(), 'Data Source: ')]",
        )
    ]
    licenses = [
        elm.text
        for elm in driver.find_elements(
            by="xpath",
            value="//details//ul/li[contains(text(), 'License: ')]",
        )
    ]
    scores = [
        elm.text
        for elm in driver.find_elements(
            by="xpath",
            value="//details//ul/li[contains(text(), 'Score: ')]",
        )
    ]
    # make sure no list is empty
    assert all([summary, urls, paths, sources, licenses, scores])
    # make sure all list have the same len
    assert (
        len(summary)
        == len(urls)
        == len(paths)
        == len(sources)
        == len(licenses)
        == len(scores)
        == 3
    )
    match_dict = {}
    for i, summ in enumerate(summary):
        match_dict[summ] = {
            "url": urls[i].strip("URL: "),
            "path": paths[i].strip("Path: "),
            "source": sources[i].strip("Data Source: "),
            "license": licenses[i].strip("License: "),
            "score": scores[i].strip("Score: "),
        }
    return match_dict


def get_admin_portal_url() -> str:
    """Returns the base URL for the admin portal based on the target env."""
    return "https://stage.ai.ansible.redhat.com/console/admin/settings"


def side_nav(driver: WebDriver, page_name: str) -> None:
    """Use the side menu to navigate to the given page.

    Args:
        driver: WebDriver instance
        page_name: Name of the page to navigate to
    """
    # validate the side menu is open
    try:
        wait_displayed(driver, "//p[text()='Ansible Lightspeed with']", timeout=5)
    except TimeoutException:
        side_button = wait_displayed(driver, "//button[@id='nav-toggle']", timeout=5)
        side_button.click()
    admin_button = wait_displayed(
        driver,
        "//button[normalize-space(.)='Admin Portal']",
        timeout=5,
    )
    admin_button.click()
    nav_target = wait_displayed(
        driver,
        f"//a[normalize-space(.)='{page_name}']",
        timeout=10,
    )
    nav_target.click()


class Checkbox:
    """This class defines a checkbox.

    Args:
        driver: WebDriver instance
        xpath: XPath selector for the checkbox
    """

    def __init__(self, driver: WebDriver, xpath: str) -> None:
        """Initialize the Checkbox.

        Args:
            driver: WebDriver instance
            xpath: XPath selector for the checkbox
        """
        self._element = wait_displayed(driver, xpath)
        self.xpath = xpath

    @property
    def selected(self) -> bool:
        """Check if the checkbox is selected.

        Returns:
            True if selected, False otherwise
        """
        elm = self._element.find_element(By.XPATH, f"{self.xpath}/input")
        return elm.is_selected()

    def get_label(self) -> str:
        """Get the label text.

        Returns:
            The label text
        """
        label = self._element.find_element(By.XPATH, f"{self.xpath}/label")
        return label.text

    def fill_checkbox(self) -> bool:
        """Fill the checkbox by clicking it.

        Returns:
            The selection state after clicking
        """
        check = self._element.find_element(By.XPATH, f"{self.xpath}/input")
        check.click()
        return self.selected


def vscode_textfield_interact(
    driver: WebDriver,
    field_id: str,
    value: str,
) -> None:
    """Find a vscode-textfield by ID and enter a value.

    Args:
        driver: WebDriver instance
        field_id: The ID attribute of the vscode-textfield element
        value: The text value to send to the field
    """
    text_field = find_element_across_iframes(
        driver,
        f"//vscode-textfield[@id='{field_id}']",
        retries=10,
    )
    text_field.send_keys(value)


def vscode_button_click(driver: WebDriver, button_id: str) -> None:
    """Find a vscode-button by ID, verify it's enabled, and click it."""
    button = find_element_across_iframes(
        driver,
        f"//vscode-button[@id='{button_id}']",
        retries=10,
    )
    assert button.is_enabled(), f"{button_id} should be enabled"
    button.click()
