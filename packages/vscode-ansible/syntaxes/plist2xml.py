import re
from typing import Match
import pyparsing as pp
import lxml.etree as ET
import click


@click.command()
@click.argument('source', required=True)
@click.argument('dest', required=True)
def main(source, dest):
    ast = parse(source)

    plist: ET.Element = ET.Element('plist', version="1.0")
    generate_xml(plist, ast)

    ET.indent(plist, '    ')
    xml = ET.tostring(
        plist, encoding='UTF-8', xml_declaration=True,
        doctype='<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    )

    with open(dest, 'wb') as f:
        f.write(xml)


def parse(plistPath):
    # https://macromates.com/manual/en/appendix#property-list-format
    # https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/PropertyLists/OldStylePlists/OldStylePLists.html#//apple_ref/doc/uid/20001012-BBCBDBJE
    LPAR, RPAR, LBRACE, RBRACE, EQUALS, SEMI, COL = map(pp.Suppress, "(){}=;,")

    array = pp.Forward().setName('array')
    dictionary = pp.Forward().setName('dict')
    string = (pp.QuotedString('"', escChar="\\", multiline=True, convertWhitespaceEscapes=True) |
              pp.QuotedString("'", escQuote="''", multiline=True, convertWhitespaceEscapes=False) |
              pp.Word(pp.alphanums+'_-'))('string').setName('simple string or quoted string')

    # order here is very important when using '-'
    element = pp.Group(string | array | dictionary)('value')

    # that '+' is required for matching the optional colon
    array_elements = element - pp.ZeroOrMore(COL + element) - pp.Optional(COL)
    array << pp.Group(LPAR - pp.Optional(array_elements) -
                      RPAR)('array')

    dict_item = pp.Group(string('key') - EQUALS - element - SEMI)
    dictionary << pp.Group(LBRACE -
                           pp.ZeroOrMore(dict_item) -
                           RBRACE)('dict')

    res = dictionary.parseFile(plistPath, parseAll=True)
    return res


def generate_xml(parent: ET.Element, data: pp.ParseResults, level=0, indent=4):
    if 'dict' in data:
        dictionary = data['dict']
        parent = ET.SubElement(parent, 'dict')
        for dict_item in dictionary:
            key = dict_item['key']
            x_key = ET.SubElement(parent, 'key')
            x_key.text = key
            value = dict_item['value']
            generate_xml(parent, value, level+1, indent)
        pass
    elif 'array' in data:
        array = data['array']
        parent = ET.SubElement(parent, 'array')
        for array_item in array:
            generate_xml(parent, array_item, level+1, indent)
    elif 'string' in data:
        string: str = data['string']
        lines = string.split('\n')
        reindented_lines = [lines[0]]
        for line in lines[1:]:
            m: Match = re.match(f'^[ ]{{{(level-1)*indent}}}', line)
            if m:
                # remove plist indent
                line = line[len(m.group(0)):]
                # insert XML indent
                line = ' '*((level)*indent) + line
            reindented_lines.append(line)

        x_string = ET.SubElement(parent, 'string')
        x_string.text = '\n'.join(reindented_lines)


if __name__ == "__main__":
    main()
