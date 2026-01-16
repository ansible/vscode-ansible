"""
This module contains utils to be used with UI testing
"""

# pylint: disable=E0401
import os
import time

from selenium.common import ElementClickInterceptedException
from selenium.common import NoSuchElementException
from selenium.common import NoSuchFrameException
from selenium.common.exceptions import ElementNotInteractableException
from selenium.common.exceptions import NoSuchWindowException
from selenium.common.exceptions import StaleElementReferenceException
from selenium.common.exceptions import TimeoutException
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

USERNAME = os.environ.get("LIGHTSPEED_USER")
PASSWORD = os.environ.get("LIGHTSPEED_PASSWORD")

# Move cursor to the "Explain the playbook with Ansible Lightspeed" menu item.
# Note: The required number of DOWN key presses varies by VSCode version.
POSITION_OF_ANSIBLE_EXPLAIN = 9


class TimeOutError(Exception):
    """
    Exception for when wait exceeded timeout
    """


def wait_displayed(driver, xpath, timeout=10):
    """
    wait for element to be displayed
    """
    wait = WebDriverWait(driver, timeout=timeout)
    elm = wait.until(EC.visibility_of_element_located((By.XPATH, xpath)))
    if not elm:
        raise TimeOutError(f"timeout waiting for {xpath}")
    return elm


def click_and_wait(driver, element, wait_for=None, timeout=10):
    """
    click an element and wait for the next step
    if wait_for is given it will wait for it to be displayed,
    otherwise it will wait as many seconds as given by timeout
    """
    wait = WebDriverWait(driver, 30)
    wait.until(EC.element_to_be_clickable(element))

    def duration(start_time=time.time()):
        return time.time() - start_time

    while True:
        try:
            element.click()
            break
        except (ElementClickInterceptedException, StaleElementReferenceException):
            # When there are fade out effects took some time, just wait and click again
            pass

        if duration() > timeout:
            raise TimeOutError(f"timeout trying to click on {element}")

    if wait_for:
        return wait_displayed(driver, wait_for, timeout=timeout)


def validate_links(driver, urls: list[str], parent_xpath: str):
    """
    validates all links under given element
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
    assert urls == [], f"ERROR - one or more expected urls are missing from element {parent_xpath}"


def user_is_auth(driver):
    """
    Return true if a user is already connected
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


def sso_auth_flow(  # pylint: disable=too-many-arguments, too-many-positional-arguments
    driver,
    username=USERNAME,
    password=PASSWORD,
    admin_login=False,
    no_wca=False,
    no_sub=False,
):
    """
    containing all the steps to perform the login with redhat. We've a christmas tree of parameters
    because of tests in test_login.
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

    def duration(start_time=time.time()):
        return time.time() - start_time

    def get_elements_to_click():
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
            'a = document.getElementById("consent_blackbar"); if (a) {a.remove();}'
        )
        for elt in get_elements_to_click():
            try:
                elt.click()
            except (
                ElementNotInteractableException,
                ElementClickInterceptedException,
                StaleElementReferenceException,
            ):
                pass
        driver.switch_to.default_content()

        for f, v in fields.items():
            for elm in driver.find_elements(by="xpath", value=f):
                try:
                    elm.send_keys(v)

                except (
                    ElementNotInteractableException,
                    ElementClickInterceptedException,
                    StaleElementReferenceException,
                ):
                    continue

        if duration() > 90:
            raise TimeOutError("timeout during the AAP login")
    print(f"RHSSO auth done in {duration():.2f}s")
    return user


def redhat_logout(driver):
    """
    log-out from the lightspeed main landing page
    """
    logout_button = wait_displayed(driver, "//button[normalize-space(.)='Log out']")
    assert logout_button.is_displayed() and logout_button.is_enabled()
    logout_button.click()


def admin_portal_logout(driver):
    """
    log-out from the admin portal
    """
    logout_dropdown = wait_displayed(driver, "//button[contains(normalize-space(.), 'lightspeed')]")
    logout_button = click_and_wait(
        driver, logout_dropdown, "//button[contains(normalize-space(.), 'Logout')]"
    )
    logout_button.click()
    sso_logout_button = driver.find_element(by="xpath", value="//input[@id='kc-logout']")
    sso_logout_button.click()
    wait_displayed(driver, "//a[normalize-space(.)='Log in']")


def vscode_login(driver, device_login=False, **kwargs):
    """
    go through the login process to ansible and vscode
    :return:
    """
    vscode_connect(driver, device_login=device_login)

    sso_auth_flow(driver, **kwargs)
    # switch back to vs-code
    driver.switch_to.window(driver.window_handles[0])
    # user is now logged in, get a prediction
    time.sleep(2)


def switch_vscode_ligthspeed_url(driver, new_url):
    """
    switch the lightspeed url in vscode using the UI
    """
    ActionChains(driver).key_down(Keys.CONTROL).send_keys(",").key_up(Keys.CONTROL).perform()
    search_settings = find_element_across_iframes(
        driver, "//textarea[@aria-label='Search settings']"
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


def get_connect_button(driver) -> WebElement:
    """
    Attempts to find and return the Connect button in VSCode's Ansible extension interface.

    This function implements a retry mechanism to handle common Selenium WebDriver issues:
    - Refreshes the page if the button is not found
    - Handles various Selenium exceptions including invalid session errors

    Raises:
        NoSuchElementException: If button not found after all retries
        TimeOutError: If finding element times out
        ValueError: If element search fails
        WebDriverException: For other WebDriver related errors
    """
    connect_button = None
    for attempt in range(5):
        try:
            connect_button = find_element_across_iframes(
                driver, "//vscode-button[normalize-space(.)='Connect']", retries=10
            )
            return connect_button
        except (NoSuchElementException, TimeOutError, ValueError, WebDriverException):
            if attempt == 4:
                raise
            driver.refresh()
            time.sleep(5)  # Wait for page to reload
    return None


def vscode_install_vsix(driver):
    for i in range(5):
        try:
            vscode_run_command(driver, ">Extensions: Install from VSix")
            vsix_file = wait_displayed(driver, "//span[text()='ansible-latest.vsix']", timeout=10)
            vsix_file.click()
            info_box = find_element_across_iframes(
                driver, "//span[text()='Completed installing extension.']"
            )
            info_box.click()
            click_and_wait(
                driver, info_box, "//a[@aria-label='Clear Notification (Delete)']", timeout=10
            )
            return
        except (TimeoutException, TimeOutError, ElementClickInterceptedException):
            if i == 4:
                raise


def vscode_connect(driver, user_menu=False, device_login=False, install_vsix=True):
    """
    go to the vscode ansible page and click the "connect" button
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
        connect_button = click_and_wait(
            driver,
            user_button,
            "//a[normalize-space(.)='Sign in with Ansible Lightspeed to use Ansible (1)']",
        )
        open_button = click_and_wait(
            driver, connect_button, "//a[normalize-space(.)='Open']", timeout=10
        )
        open_button.click()
    else:
        ansible_button.click()
        connect_button = get_connect_button(driver)
        connect_button.click()
        driver.switch_to.default_content()
        allow_button = wait_displayed(driver, "//a[normalize-space(.)='Allow']", timeout=10)
        open_button = click_and_wait(
            driver, allow_button, "//a[normalize-space(.)='Open']", timeout=10
        )

        open_button.click()
    driver.switch_to.window(driver.window_handles[-1])


def find_element_across_iframes(driver, xpath, retries=3):
    """
    loop over all the iframes and nested iframe and returns the
    first one matching the selector
    """
    for _ in range(retries):
        driver.switch_to.default_content()
        try:
            return driver.find_element(By.XPATH, xpath)
        except NoSuchElementException:
            pass
        iframes = driver.find_elements(By.XPATH, "//iframe")
        for iframe in iframes:
            driver.switch_to.default_content()
            driver.switch_to.frame(iframe)
            try:
                return driver.find_element(By.XPATH, xpath)
            except NoSuchElementException:
                pass

            try:
                nested_iframes = driver.find_elements(By.XPATH, "//iframe")
                for ni in nested_iframes:
                    try:
                        driver.switch_to.frame(ni)
                        return driver.find_element(By.XPATH, xpath)
                    except (
                        NoSuchElementException,
                        NoSuchFrameException,
                        StaleElementReferenceException,
                    ):
                        driver.switch_to.default_content()
                        pass
            except (
                NoSuchElementException,
                NoSuchFrameException,
                StaleElementReferenceException,
            ):
                driver.switch_to.default_content()
                pass
        time.sleep(1)
    raise ValueError("element not found", xpath)


def find_elements_across_iframes(driver, xpath, retries=3):
    """
    loop over all the iframes and nested iframe and returns the
    first one matching the selector
    """
    for _ in range(retries):
        try:
            driver.switch_to.default_content()
            yield from driver.find_elements(By.XPATH, xpath)
            iframes = driver.find_elements(By.XPATH, "//iframe")
            for iframe in iframes:
                driver.switch_to.default_content()
                driver.switch_to.frame(iframe)
                yield from driver.find_elements(By.XPATH, xpath)
                try:
                    nested_iframes = driver.find_elements(By.XPATH, "//iframe")
                    for ni in nested_iframes:
                        driver.switch_to.frame(ni)
                        yield from driver.find_elements(By.XPATH, xpath)
                    driver.switch_to.default_content()
                    continue
                except (
                    WebDriverException,
                    NoSuchElementException,
                    NoSuchFrameException,
                    StaleElementReferenceException,
                ):
                    pass
            time.sleep(1)
        except (
            NoSuchWindowException,
            NoSuchElementException,
            NoSuchFrameException,
            StaleElementReferenceException,
        ):
            time.sleep(1)
            pass
    return []


def vscode_prediction(driver, file_name, playbook, accept=True, mutil_provider=False):
    """
    this function attempts to make a prediction from vscode.
    it assumes that navigation and login already took place
    it will open the file named file_name and will input playbook to it
    then it will press ENTER and TAB
    """
    # open up the explorer panel
    ActionChains(driver).key_down(Keys.CONTROL).key_down(Keys.SHIFT).send_keys("e").perform()
    ActionChains(driver).key_up(Keys.CONTROL).key_up(Keys.SHIFT).perform()
    wait_displayed(driver, f"//span[text()='{file_name}']", timeout=10).click()
    # click the text area to be able to input
    clear_text(driver)
    wait_displayed(
        driver, "//div[@class='view-lines monaco-mouse-cursor-text']", timeout=60
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
            driver, "//span[contains(normalize-space(.), 'pilot')]", timeout=60
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


def vscode_trial_button(driver, file_name, playbook):
    """
    the function returns the Trial button
    """
    try:  # in case explorer is already open
        wait_displayed(driver, f"//span[text()='{file_name}']", timeout=1).click()
    except (TimeoutException, TimeOutError, ElementClickInterceptedException):
        # go to explorer
        explorer = wait_displayed(driver, "//a[contains(@aria-label, 'Explorer')]", timeout=60)
        explorer.click()
        # open the playbook
        try:
            wait_displayed(driver, f"//span[text()='{file_name}']", timeout=60).click()
        except ElementClickInterceptedException:
            ActionChains(driver).move_to_element(explorer).move_by_offset(0, 50).perform()
            wait_displayed(driver, f"//span[text()='{file_name}']", timeout=60).click()
    # click the text area to be able to input
    clear_text(driver)
    wait_displayed(
        driver, "//div[@class='view-lines monaco-mouse-cursor-text']", timeout=60
    ).click()
    lines = playbook.split("\n")
    # input the content with low-level interactions
    actions = ActionChains(driver)
    for line in lines:
        actions.send_keys(line)
        actions.send_keys(Keys.ENTER)
        actions.perform()
    for n in range(4):
        vscode_run_command(driver, ">Ansible Lightspeed: Inline suggestion trigger")
        time.sleep(0.5)
        try:
            if trial_button := wait_displayed(
                driver, "//a[contains(text(), 'Start a trial')]", timeout=10
            ):
                return trial_button
        except TimeoutException:
            if n == 3:
                raise
    return None


def clear_text(driver):
    """
    clear all the text in the vscode text code editor
    this should be used as a teardown when running multiple prediction tests
    """
    # click the text area to be able to input
    wait_displayed(
        driver, "//div[@class='view-lines monaco-mouse-cursor-text']", timeout=60
    ).click()
    actions = ActionChains(driver)
    actions.key_down(Keys.CONTROL).send_keys("a").key_up(Keys.CONTROL).perform()
    actions.send_keys(Keys.BACKSPACE).perform()


def close_all_tabs(driver):
    """
    close all the open tabs
    and interact with the "Should we save your file?" message box
    """
    for _ in find_elements_across_iframes(driver, "//a[@aria-label='Close (Ctrl+W)']"):
        ActionChains(driver).key_down(Keys.CONTROL).send_keys("w").key_up(Keys.CONTROL).perform()
        for elm in driver.find_elements(by="xpath", value='//a[normalize-space(.)="Don\'t Save"]'):
            elm.click()


def vscode_explanation(driver):
    """
    this function attempts to make an explanation from vscode.
    it assumes that navigation and login already took place
    it will open the file named file_name and will go through the UI process
    to get an explanation
    """
    # click the text area to be able to input
    text_window = wait_displayed(
        driver, "//div[@class='view-lines monaco-mouse-cursor-text']", timeout=60
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
    driver.switch_to.frame(driver.find_element(By.XPATH, "//iframe[@class='webview ready']"))
    # move to new iframe again
    driver.switch_to.frame(driver.find_element(By.XPATH, "//iframe[@title='Explanation']"))
    explanation_elem = wait_displayed(driver, "//div[@class='explanation']", timeout=15)
    explanation = explanation_elem.text

    close_all_tabs(driver)
    return explanation


def vscode_playbook_generation(driver, task: str):
    """
    this function attempts to make a generation from vscode.
    it assumes that navigation and login already took place
    it will go through all the generation process and will return
    when the generated playbook is reached
    """
    # run gen command
    vscode_run_command(driver, ">Ansible Lightspeed: Playbook generation")
    title = find_element_across_iframes(
        driver, "//h2[contains(text(), 'Create a playbook with Ansible Lightspeed')]"
    )

    assert title.text == "Create a playbook with Ansible Lightspeed"
    message = wait_displayed(driver, "//div[@class='promptContainer']/label")
    assert message.text == "Describe what you want to achieve in natural language"
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "1 of 3"
    # first step
    txt_input = wait_displayed(driver, "//div[@id='PromptTextField']/input")
    txt_input.send_keys(task)
    submit_button = wait_displayed(driver, "//vscode-button[normalize-space(.)='Analyze']")
    submit_button.click()
    # second step
    # # sleep
    # time.sleep(500)
    message = wait_displayed(driver, "//h4", timeout=600)
    assert message.text == "Review the suggested steps for your playbook and modify as needed."
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "2 of 3"
    steps_elm = wait_displayed(driver, "//textarea[@id='outline-field']")
    steps = steps_elm.get_attribute("value")
    gen_button = wait_displayed(driver, "//vscode-button[normalize-space(.)='Continue']")
    gen_button.click()
    # third step
    page = wait_displayed(driver, "//div[@id='page-number']", timeout=60)
    assert page.text == "3 of 3"
    playbook = wait_displayed(driver, "//code").text
    editor_button = wait_displayed(driver, "//vscode-button[normalize-space(.)='Open editor']")
    editor_button.click()
    # exit iframes and wait for playbook
    driver.switch_to.default_content()
    wait_displayed(driver, "//span[contains(normalize-space(.), 'tasks:')]", timeout=60)
    return steps, playbook


def vscode_role_generation(driver, task: str):
    """
    this function attempts to make a generation from vscode.
    it assumes that navigation and login already took place
    it will go through all the generation process and will return
    when the generated playbook is reached
    """
    # run gen command
    vscode_run_command(driver, ">Ansible Lightspeed: Role generation")
    title = find_element_across_iframes(
        driver, "//h2[contains(text(), 'Create a role with Ansible Lightspeed')]"
    )

    assert title.text == "Create a role with Ansible Lightspeed"
    message = wait_displayed(driver, "//div[@class='promptContainer']/label")
    assert message.text == "Describe what you want to achieve in natural language"
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "1 of 3"
    # first step
    txt_input = wait_displayed(driver, "//div[@id='PromptTextField']/input")
    txt_input.send_keys(task)
    submit_button = wait_displayed(driver, "//vscode-button[normalize-space(.)='Analyze']")
    submit_button.click()
    # second step
    # # sleep
    # time.sleep(500)
    message = wait_displayed(driver, "//h4", timeout=600)
    assert message.text == "Review the suggested steps for your role and modify as needed."
    page = wait_displayed(driver, "//div[@id='page-number']")
    assert page.text == "2 of 3"
    steps_elm = wait_displayed(driver, "//textarea[@id='outline-field']")
    steps = steps_elm.get_attribute("value")
    gen_button = wait_displayed(driver, "//vscode-button[normalize-space(.)='Continue']")
    gen_button.click()
    # third step
    page = wait_displayed(driver, "//div[@id='page-number']", timeout=60)
    assert page.text == "3 of 3"
    wait_displayed(driver, "//vscode-button[normalize-space(.)='Save files']")
    code_block = driver.find_elements(by="xpath", value="//code")[0]
    tasks = code_block.text
    return steps, tasks


def get_vscode_file_text(driver):
    """
    this function gets the text currently displayed in the file
    open by vscode
    """
    playbook = ""
    words = driver.find_elements(by="xpath", value="//div[@class='view-line']/span/span")
    for word in words:
        text = word.text
        playbook += text
    return playbook


def vscode_run_command(driver, command: str):
    """
    this function runs a command on vscode
    """
    driver.switch_to.default_content()
    if not command.startswith(">"):
        command = ">" + command
    # click the command box
    #
    for i in range(4):
        try:
            command_box = find_element_across_iframes(
                driver, "//li[@class='action-item command-center-center']"
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
        ) as e:
            if i == 3:
                raise e
            time.sleep(1)

    command_input.send_keys(command)
    # enter
    actions = ActionChains(driver)
    actions.send_keys(Keys.ENTER).perform()


def get_vscode_attribution(driver, prompt):
    """
    this function returns a dict for the attribution that is currently displayed
    note that the attribution needs to be in the view already before
    calling this function
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
    urls = [elm.text for elm in driver.find_elements(by="xpath", value="//details//ul/li/a")]
    paths = [
        elm.text
        for elm in driver.find_elements(
            by="xpath", value="//details//ul/li[contains(text(), 'Path: ')]"
        )
    ]
    sources = [
        elm.text
        for elm in driver.find_elements(
            by="xpath", value="//details//ul/li[contains(text(), 'Data Source: ')]"
        )
    ]
    licenses = [
        elm.text
        for elm in driver.find_elements(
            by="xpath", value="//details//ul/li[contains(text(), 'License: ')]"
        )
    ]
    scores = [
        elm.text
        for elm in driver.find_elements(
            by="xpath", value="//details//ul/li[contains(text(), 'Score: ')]"
        )
    ]
    # make sure no list is empty
    assert all([summary, urls, paths, sources, licenses, scores])
    # make sure all list have the same len
    assert (
        len(summary) == len(urls) == len(paths) == len(sources) == len(licenses) == len(scores) == 3
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


def get_admin_portal_url():
    """
    returns the base URL for the admin portal based on the target env
    """
    return "https://stage.ai.ansible.redhat.com/console/admin/settings"


def side_nav(driver, page_name):
    """
    use the side menu to navigate to the given page
    """
    # validate the side menu is open
    try:
        wait_displayed(driver, "//p[text()='Ansible Lightspeed with']", timeout=5)
    except TimeoutException:
        side_button = wait_displayed(driver, "//button[@id='nav-toggle']", timeout=5)
        side_button.click()
    admin_button = wait_displayed(driver, "//button[normalize-space(.)='Admin Portal']", timeout=5)
    admin_button.click()
    nav_target = wait_displayed(driver, f"//a[normalize-space(.)='{page_name}']", timeout=10)
    nav_target.click()


class Checkbox:
    """
    this class defines a checkbox
    """

    def __init__(self, driver, xpath) -> None:
        self._element = wait_displayed(driver, xpath)
        self.xpath = xpath

    @property
    def selected(self):
        """
        checks if the checkbox is selected
        """
        elm = self._element.find_element(By.XPATH, f"{self.xpath}/input")
        return elm.is_selected()

    def get_label(self):
        """
        get the label
        """
        label = self._element.find_element(By.XPATH, f"{self.xpath}/label")
        return label.text

    def fill_checkbox(self):
        """
        fill the checkbox
        """
        check = self._element.find_element(By.XPATH, f"{self.xpath}/input")
        check.click()
        return self.selected
