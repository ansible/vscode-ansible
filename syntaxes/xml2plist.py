"""Convert XML format to plist format."""

import pathlib
import re
import xml.etree.ElementTree as ET  # noqa: S405
from re import Match

import click


@click.command()
@click.argument("source", required=True)
@click.argument("dest", required=True)
def main(source: str, dest: str) -> None:
    """Convert XML file to plist format.

    Args:
        source: Path to source XML file
        dest: Path to destination plist file
    """
    root = ET.parse(source).getroot()  # noqa: S314

    pathlib.Path(dest).write_text(convert_to_plist(root), encoding="utf-8")


def to_safe_string(text: str) -> str:
    """Convert text to safe plist string format.

    Args:
        text: Input text

    Returns:
        Safely formatted string for plist
    """
    if re.match(r"^[\w-]+$", text):
        return text
    text = text.replace("'", "''")  # escape single-quotes
    return f"'{text}'"


def format_value(
    tag: str, value: list | str, level: int, indent: int, context: str
) -> str:
    """Format a value for plist output.

    Args:
        tag: XML tag name
        value: Value to format (list or string)
        level: Current indentation level
        indent: Number of spaces per level
        context: Context type (e.g., 'mapping')

    Returns:
        Formatted plist string
    """
    xml_indent = 4
    indentation = " " * indent * level
    start_indent = "" if context == "mapping" else indentation

    if type(value) is list:
        if tag == "dict":
            start = "{"
            end = "}"
            joined_values = "\n".join(value)
        elif tag == "array":
            start = "("
            end = ")"
            joined_values = ",\n".join(value)
        return f"{start_indent}{start}\n{joined_values}\n{indentation}{end}"
    reindented_lines = []
    lines = value.split("\n")
    for line in lines:
        m: Match = re.match(r"^[\t ]*", line)
        # Normalize tabs to spaces
        text_indentation = m.group(0).replace("\t", " " * xml_indent)
        # reindent in case indent does not match xml_indent
        text_indentation = " " * int(
            len(text_indentation) / xml_indent * indent - indent,
        )  # working one level lower (plist tag is removed)
        reindented_lines.append(text_indentation + line.lstrip())
    value = "\n".join(reindented_lines)
    return f"{start_indent}{value}"


def convert_to_plist(
    element: ET.Element, level: int = 0, indent: int = 4, context: str = ""
) -> str:
    """Convert XML element tree to plist format.

    Args:
        element: XML element to convert
        level: Current indentation level
        indent: Number of spaces per level
        context: Context type

    Raises:
        ValueError: If the element tag is not recognized

    Returns:
        Plist formatted string
    """
    if element.tag == "dict":
        # with new level, since indent is appended already here
        inner_indentation = " " * indent * (level + 1)
        dict_iter = iter(element)
        dict_items = []
        while True:
            try:
                key_element = next(dict_iter)
                # Skipping black formatting due to https://github.com/astral-sh/ruff/issues/15927
                # fmt: off
                if key_element.tag != "key":
                    msg = f"Got {key_element.tag}({key_element.text}) instead of key"
                    raise ValueError(msg)
                value_element = next(dict_iter, None)
                if value_element is None:
                    msg = f"Got {key_element.tag}({key_element.text}) without value"
                    raise ValueError(msg)
                # fmt: on
                item_str = (
                    f"{inner_indentation}{to_safe_string(key_element.text)} ="
                    f" {convert_to_plist(value_element, level + 1, indent, 'mapping')};"
                )
                dict_items.append(item_str)
            except StopIteration:
                break
        return format_value(element.tag, dict_items, level, indent, context)
    if element.tag == "array":
        array_items = [
            convert_to_plist(item_element, level + 1, indent)
            for item_element in element
        ]
        return format_value(element.tag, array_items, level, indent, context)
    if element.tag == "string":
        return format_value(
            element.tag, to_safe_string(element.text), level, indent, context
        )
    if element.tag == "plist":
        return convert_to_plist(element[0], level, indent)
    msg = f"Unrecognized tag: {element.tag}"
    raise ValueError(msg)


if __name__ == "__main__":
    main()
