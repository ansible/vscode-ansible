"""Unit tests for ui_utils module."""

# ruff: noqa: PLR6301
from collections.abc import Generator
from unittest.mock import Mock, patch

import pytest
from selenium.common.exceptions import (
    NoSuchElementException,
    NoSuchFrameException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webelement import WebElement

from test.selenium.utils.ui_utils import (
    ElementInAnyIframe,
    ElementsInAnyIframe,
    find_element_across_iframes,
    find_elements_across_iframes,
)


@pytest.mark.vscode
class TestElementInAnyIframe:
    """Test suite for ElementInAnyIframe expected condition."""

    def test_finds_element_in_default_content(self) -> None:
        """Test finding element in default content."""
        driver = Mock()
        element = Mock(spec=WebElement)
        driver.find_element.return_value = element
        driver.find_elements.return_value = []

        condition = ElementInAnyIframe("//test")
        result = condition(driver)

        assert result == element
        driver.switch_to.default_content.assert_called_once()
        driver.find_element.assert_called_once_with(By.XPATH, "//test")

    def test_finds_element_in_top_level_iframe(self) -> None:
        """Test finding element in a top-level iframe."""
        driver = Mock()
        iframe = Mock(spec=WebElement)
        element = Mock(spec=WebElement)

        # Default content has no element
        driver.find_element.side_effect = [
            NoSuchElementException(),
            element,
        ]
        driver.find_elements.side_effect = [
            [iframe],  # Top-level iframes
            [],  # No nested iframes
        ]

        condition = ElementInAnyIframe("//test")
        result = condition(driver)

        assert result == element
        assert driver.switch_to.default_content.call_count >= 2
        driver.switch_to.frame.assert_called_once_with(iframe)

    def test_finds_element_in_nested_iframe(self) -> None:
        """Test finding element in a nested iframe."""
        driver = Mock()
        iframe = Mock(spec=WebElement)
        nested_iframe = Mock(spec=WebElement)
        element = Mock(spec=WebElement)

        # Default content has no element, top-level iframe has no element
        # Nested iframe has the element
        driver.find_element.side_effect = [
            NoSuchElementException(),
            NoSuchElementException(),
            element,
        ]
        driver.find_elements.side_effect = [
            [iframe],  # Top-level iframes
            [nested_iframe],  # Nested iframes
        ]

        condition = ElementInAnyIframe("//test")
        result = condition(driver)

        assert result == element
        assert driver.switch_to.frame.call_count == 2

    def test_returns_false_when_element_not_found(self) -> None:
        """Test that False is returned when element is not found anywhere."""
        driver = Mock()
        driver.find_element.side_effect = NoSuchElementException()
        driver.find_elements.return_value = []  # No iframes

        condition = ElementInAnyIframe("//test")
        result = condition(driver)

        assert result is False
        driver.switch_to.default_content.assert_called()

    def test_handles_stale_element_in_iframe(self) -> None:
        """Test graceful handling of stale element references in iframes."""
        driver = Mock()
        iframe = Mock(spec=WebElement)

        driver.find_element.side_effect = NoSuchElementException()
        driver.find_elements.return_value = [iframe]
        driver.switch_to.frame.side_effect = StaleElementReferenceException()

        condition = ElementInAnyIframe("//test")
        result = condition(driver)

        # Should return False and not raise exception
        assert result is False

    def test_handles_no_such_frame_exception(self) -> None:
        """Test graceful handling of NoSuchFrameException."""
        driver = Mock()
        iframe = Mock(spec=WebElement)

        driver.find_element.side_effect = NoSuchElementException()
        driver.find_elements.return_value = [iframe]
        driver.switch_to.frame.side_effect = NoSuchFrameException()

        condition = ElementInAnyIframe("//test")
        result = condition(driver)

        # Should return False and not raise exception
        assert result is False


@pytest.mark.vscode
class TestElementsInAnyIframe:
    """Test suite for ElementsInAnyIframe expected condition."""

    def test_finds_elements_in_default_content(self) -> None:
        """Test finding elements in default content."""
        driver = Mock()
        element1 = Mock(spec=WebElement)
        element2 = Mock(spec=WebElement)
        driver.find_elements.side_effect = [
            [element1, element2],  # Elements in default content
            [],  # No iframes
        ]

        condition = ElementsInAnyIframe("//test")
        result = condition(driver)

        assert result == [element1, element2]
        driver.switch_to.default_content.assert_called()

    def test_finds_elements_across_multiple_iframes(self) -> None:
        """Test finding elements across multiple iframes."""
        driver = Mock()
        iframe = Mock(spec=WebElement)
        element1 = Mock(spec=WebElement)
        element2 = Mock(spec=WebElement)

        driver.find_elements.side_effect = [
            [element1],  # Element in default content
            [iframe],  # Top-level iframes
            [element2],  # Element in iframe
            [],  # No nested iframes
        ]

        condition = ElementsInAnyIframe("//test")
        result = condition(driver)

        assert isinstance(result, list)
        assert element1 in result
        assert element2 in result
        assert len(result) == 2

    def test_finds_elements_in_nested_iframes(self) -> None:
        """Test finding elements in nested iframes."""
        driver = Mock()
        iframe = Mock(spec=WebElement)
        nested_iframe = Mock(spec=WebElement)
        element1 = Mock(spec=WebElement)
        element2 = Mock(spec=WebElement)
        element3 = Mock(spec=WebElement)

        driver.find_elements.side_effect = [
            [element1],  # Element in default content
            [iframe],  # Top-level iframes
            [element2],  # Element in top-level iframe
            [nested_iframe],  # Nested iframes
            [element3],  # Element in nested iframe
        ]

        condition = ElementsInAnyIframe("//test")
        result = condition(driver)

        assert isinstance(result, list)
        assert element1 in result
        assert element2 in result
        assert element3 in result
        assert len(result) == 3

    def test_returns_false_when_no_elements_found(self) -> None:
        """Test that False is returned when no elements are found."""
        driver = Mock()
        driver.find_elements.side_effect = [
            [],  # No elements in default content
            [],  # No iframes
        ]

        condition = ElementsInAnyIframe("//test")
        result = condition(driver)

        assert result is False

    def test_handles_stale_elements_in_iframe(self) -> None:
        """Test graceful handling of stale element references when finding multiple elements."""
        driver = Mock()
        iframe = Mock(spec=WebElement)

        driver.find_elements.side_effect = [
            [],  # No elements in default content
            [iframe],  # Has iframe
        ]
        driver.switch_to.frame.side_effect = StaleElementReferenceException()

        condition = ElementsInAnyIframe("//test")
        result = condition(driver)

        # Should return False and not raise exception
        assert result is False


@pytest.mark.vscode
class TestFindElementAcrossIframes:
    """Test suite for find_element_across_iframes function."""

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_finds_element_successfully(self, mock_wait: Mock) -> None:
        """Test successful element finding."""
        driver = Mock()
        element = Mock(spec=WebElement)
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = element
        mock_wait.return_value = mock_wait_instance

        result = find_element_across_iframes(driver, "//test", retries=5)

        assert result == element
        mock_wait.assert_called_once_with(driver, timeout=5, poll_frequency=0.5)
        mock_wait_instance.until.assert_called_once()

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_raises_value_error_on_timeout(self, mock_wait: Mock) -> None:
        """Test that ValueError is raised when element is not found."""
        driver = Mock()
        mock_wait_instance = Mock()
        mock_wait_instance.until.side_effect = TimeoutException()
        mock_wait.return_value = mock_wait_instance

        with pytest.raises(ValueError, match="element not found: //test"):
            find_element_across_iframes(driver, "//test", retries=3)

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_uses_default_timeout_for_element(self, mock_wait: Mock) -> None:
        """Test that default timeout of 3 seconds is used for finding element."""
        driver = Mock()
        element = Mock(spec=WebElement)
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = element
        mock_wait.return_value = mock_wait_instance

        find_element_across_iframes(driver, "//test")

        mock_wait.assert_called_once_with(driver, timeout=3, poll_frequency=0.5)

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_passes_element_expected_condition(self, mock_wait: Mock) -> None:
        """Test that correct expected condition is passed for element finding."""
        driver = Mock()
        element = Mock(spec=WebElement)
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = element
        mock_wait.return_value = mock_wait_instance

        find_element_across_iframes(driver, "//custom/xpath", retries=10)

        # Verify the expected condition is an instance of ElementInAnyIframe
        call_args = mock_wait_instance.until.call_args[0]
        assert isinstance(call_args[0], ElementInAnyIframe)
        assert call_args[0].xpath == "//custom/xpath"


@pytest.mark.vscode
class TestFindElementsAcrossIframes:
    """Test suite for find_elements_across_iframes function."""

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_yields_elements_successfully(self, mock_wait: Mock) -> None:
        """Test successful elements finding and yielding."""
        driver = Mock()
        element1 = Mock(spec=WebElement)
        element2 = Mock(spec=WebElement)
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = [element1, element2]
        mock_wait.return_value = mock_wait_instance

        result = list(find_elements_across_iframes(driver, "//test", retries=5))

        assert result == [element1, element2]
        mock_wait.assert_called_once_with(driver, timeout=5, poll_frequency=0.5)

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_yields_nothing_on_timeout(self, mock_wait: Mock) -> None:
        """Test that nothing is yielded when timeout occurs."""
        driver = Mock()
        mock_wait_instance = Mock()
        mock_wait_instance.until.side_effect = TimeoutException()
        mock_wait.return_value = mock_wait_instance

        result = list(find_elements_across_iframes(driver, "//test", retries=3))

        assert result == []

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_uses_default_timeout_for_elements(self, mock_wait: Mock) -> None:
        """Test that default timeout of 3 seconds is used for finding elements."""
        driver = Mock()
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = []
        mock_wait.return_value = mock_wait_instance

        list(find_elements_across_iframes(driver, "//test"))

        mock_wait.assert_called_once_with(driver, timeout=3, poll_frequency=0.5)

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_passes_elements_expected_condition(self, mock_wait: Mock) -> None:
        """Test that correct expected condition is passed for elements finding."""
        driver = Mock()
        element = Mock(spec=WebElement)
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = [element]
        mock_wait.return_value = mock_wait_instance

        list(find_elements_across_iframes(driver, "//custom/xpath", retries=10))

        # Verify the expected condition is an instance of ElementsInAnyIframe
        call_args = mock_wait_instance.until.call_args[0]
        assert isinstance(call_args[0], ElementsInAnyIframe)
        assert call_args[0].xpath == "//custom/xpath"

    @patch("test.selenium.utils.ui_utils.WebDriverWait")
    def test_generator_behavior(self, mock_wait: Mock) -> None:
        """Test that function returns a generator."""
        driver = Mock()
        element = Mock(spec=WebElement)
        mock_wait_instance = Mock()
        mock_wait_instance.until.return_value = [element]
        mock_wait.return_value = mock_wait_instance

        result = find_elements_across_iframes(driver, "//test")

        # Result should be a generator
        assert isinstance(result, Generator)
