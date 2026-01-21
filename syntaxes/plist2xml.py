"""Convert plist format to XML format."""

import pathlib
import re
from re import Match

import click
import lxml.etree as ET  # noqa: N812
import pyparsing as pp


@click.command()
@click.argument("source", required=True)
@click.argument("dest", required=True)
def main(source: str, dest: str) -> None:
    """Convert plist file to XML format.

    Args:
        source: Path to source plist file
        dest: Path to destination XML file
    """
    ast = parse(source)

    plist: ET.Element = ET.Element("plist", version="1.0")
    generate_xml(plist, ast)

    ET.indent(plist, "    ")
    xml = ET.tostring(
        plist,
        encoding="UTF-8",
        xml_declaration=True,
        doctype=(
            '<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN"'
            ' "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
        ),
    )

    pathlib.Path(dest).write_bytes(xml)


def parse(plist_path: str) -> pp.ParseResults:
    """Parse plist file and return parsed results.

    Args:
        plist_path: Path to the plist file

    Returns:
        Parsed plist data structure
    """
    # https://macromates.com/manual/en/appendix#property-list-format
    # https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/PropertyLists/OldStylePlists/OldStylePLists.html#//apple_ref/doc/uid/20001012-BBCBDBJE
    lpar, rpar, lbrace, rbrace, equals, semi, col = map(pp.Suppress, "(){}=;,")

    array = pp.Forward().setName("array")
    dictionary = pp.Forward().setName("dict")
    string = (
        pp.QuotedString(
            '"', escChar="\\", multiline=True, convertWhitespaceEscapes=True
        )
        | pp.QuotedString(
            "'", escQuote="''", multiline=True, convertWhitespaceEscapes=False
        )
        | pp.Word(pp.alphanums + "_-")
    )("string").setName("simple string or quoted string")

    # order here is very important when using '-'
    element = pp.Group(string | array | dictionary)("value")

    # that '+' is required for matching the optional colon
    array_elements = element - pp.ZeroOrMore(col + element) - pp.Optional(col)
    array << pp.Group(lpar - pp.Optional(array_elements) - rpar)("array")

    dict_item = pp.Group(string("key") - equals - element - semi)
    dictionary << pp.Group(lbrace - pp.ZeroOrMore(dict_item) - rbrace)("dict")

    return dictionary.parseFile(plist_path, parseAll=True)


def generate_xml(
    parent: ET.Element,
    data: pp.ParseResults,
    level: int = 0,
    indent: int = 4,
) -> None:
    """Generate XML from parsed plist data.

    Args:
        parent: Parent XML element
        data: Parsed plist data
        level: Current indentation level
        indent: Number of spaces per indentation level
    """
    if "dict" in data:
        dictionary = data["dict"]
        parent = ET.SubElement(parent, "dict")
        for dict_item in dictionary:
            key = dict_item["key"]
            x_key = ET.SubElement(parent, "key")
            x_key.text = key
            value = dict_item["value"]
            generate_xml(parent, value, level + 1, indent)
    elif "array" in data:
        array = data["array"]
        parent = ET.SubElement(parent, "array")
        for array_item in array:
            generate_xml(parent, array_item, level + 1, indent)
    elif "string" in data:
        string: str = data["string"]
        lines = string.split("\n")
        reindented_lines = [lines[0]]
        for line in lines[1:]:
            m: Match = re.match(f"^[ ]{{{(level - 1) * indent}}}", line)
            if m:
                # remove plist indent
                line = line[len(m.group(0)) :]
                # insert XML indent
                line = " " * ((level) * indent) + line
            reindented_lines.append(line)

        x_string = ET.SubElement(parent, "string")
        x_string.text = "\n".join(reindented_lines)


if __name__ == "__main__":
    main()
