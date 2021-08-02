from typing import Match, Union
import xml.etree.ElementTree as ET
import re
import click


@click.command()
@click.argument('source', required=True)
@click.argument('dest', required=True)
def main(source, dest):
    root = ET.parse(source).getroot()

    with open(dest, 'w') as f:
        f.write(convert_to_plist(root))


def to_safe_string(text: str):
    if re.match(r'^[\w-]+$', text):
        return text
    else:
        text = text.replace("'", "''")  # escape single-quotes
        return f"'{text}'"


def format(tag, value: Union[list, str], level, indent, context):
    xml_indent = 4
    indentation = ' '*indent*level
    if context == 'mapping':
        start_indent = ''
    else:
        start_indent = indentation

    if type(value) is list:
        if tag == 'dict':
            start = '{'
            end = '}'
            joined_values = '\n'.join(value)
        elif tag == 'array':
            start = '('
            end = ')'
            joined_values = ',\n'.join(value)
        return f"{start_indent}{start}\n{joined_values}\n{indentation}{end}"
    else:
        reindented_lines = []
        lines = value.split('\n')
        for line in lines:
            m: Match = re.match(r'^[\t ]*', line)
            # Normalize tabs to spaces
            text_indentation = m.group(0).replace('\t', ' '*xml_indent)
            # reindent in case indent does not match xml_indent
            text_indentation = ' ' * \
                int(len(text_indentation)/xml_indent *
                    indent-indent)  # working one level lower (plist tag is removed)
            reindented_lines.append(text_indentation + line.lstrip())
        value = '\n'.join(reindented_lines)
        return f"{start_indent}{value}"


def convert_to_plist(element: ET.Element, level=0, indent=4, context: str = ''):
    if element.tag == 'dict':
        # with new level, since indent is appended already here
        inner_indentation = ' '*indent*(level+1)
        dict_iter = iter(element)
        dict_items = []
        while True:
            try:
                key_element = next(dict_iter)
                assert key_element.tag == 'key', f"Got {key_element.tag}({key_element.text}) instead of key"
                value_element = next(dict_iter, None)
                assert value_element is not None, f"Got {key_element.tag}({key_element.text}) without value"
                item_str = f"{inner_indentation}{to_safe_string(key_element.text)} = {convert_to_plist(value_element, level+1, indent, 'mapping')};"
                dict_items.append(item_str)
            except StopIteration:
                break
        return format(element.tag, dict_items, level, indent, context)
    elif element.tag == 'array':
        array_items = []
        for item_element in element:
            array_items.append(convert_to_plist(item_element, level+1, indent))
        return format(element.tag, array_items, level, indent, context)
    elif element.tag == 'string':
        return format(element.tag, to_safe_string(element.text), level, indent, context)
    elif element.tag == 'plist':
        return convert_to_plist(element[0], level, indent)
    else:
        raise Exception(f"Unrecognized tag: {element.tag}")


if __name__ == "__main__":
    main()
