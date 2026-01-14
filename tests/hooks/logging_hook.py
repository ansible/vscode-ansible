"""
hook to make the test results available for fixtures
"""

# pylint: disable=unused-argument
from typing import Dict

import pytest
from pytest import CollectReport
from pytest import StashKey

phase_report_key = StashKey[Dict[str, CollectReport]]()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """hook to make the test results available for fixtures"""
    # execute all other hooks to obtain the report object
    outcome = yield
    rep = outcome.get_result()

    # store test results for each phase of a call, which can
    # be "setup", "call", "teardown"
    item.stash.setdefault(phase_report_key, {})[rep.when] = rep
