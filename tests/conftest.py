"""
pytest settings
"""

pytest_plugins = [
    "tests.fixtures",
    "tests.fixtures.ui_fixtures",
    # For screenshot_on_fail
    "tests.hooks.logging_hook",
]
