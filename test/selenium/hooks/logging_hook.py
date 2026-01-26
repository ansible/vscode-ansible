"""hook to make the test results available for fixtures."""

# pylint: disable=unused-argument

from collections.abc import Generator
from typing import Any

import pytest

phase_report_key = pytest.StashKey[dict[str, pytest.CollectReport]]()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(
    item: pytest.Item,
    call: pytest.CallInfo[None],
) -> Generator[None, Any, None]:
    """Hook to make the test results available for fixtures."""
    # execute all other hooks to obtain the report object
    outcome = yield
    rep = outcome.get_result()

    # store test results for each phase of a call, which can
    # be "setup", "call", "teardown"
    item.stash.setdefault(phase_report_key, {})[rep.when] = rep
