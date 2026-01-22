"""module for custom exception definitions."""


class YamlError(Exception):
    """Exception for when a yaml file/string is not formatted correctly."""


class AnsibleLintError(Exception):
    """Exception for when ansible-lint fails."""
