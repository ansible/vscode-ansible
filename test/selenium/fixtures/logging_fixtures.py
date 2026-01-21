"""module for fixtures related to logging and reporting."""

import logging
from collections.abc import Generator
from typing import Any

import pytest

from test.selenium.hooks.logging_hook import phase_report_key

coverage_logger = logging.getLogger("coverage_logs")
fh = logging.FileHandler("coverage.log")
fh.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
fh.setFormatter(formatter)
coverage_logger.addHandler(fh)


@pytest.fixture
def add_coverage_logs(request: pytest.FixtureRequest) -> Generator[Any, None, None]:
    """Add the name of the test, expected modules and result to the coverage log file.

    Yields:
        Function to append log data
    """
    log_data: list[tuple[str, str | None]] = []
    yield log_data.append
    coverage_logger.info("test name: %s", log_data[0][0])
    if log_data[0][1]:
        coverage_logger.info("expected modules: %s", log_data[0][1])
    report = request.node.stash[phase_report_key]
    if report["call"].failed:
        coverage_logger.info(
            "result: FAIL, %s",
            report["call"].longrepr.reprtraceback.reprentries[-1].reprfileloc.message,
        )
    else:
        coverage_logger.info("result: PASS")
