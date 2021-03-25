import { MarkupContent, MarkupKind } from 'vscode-languageserver';
import { IDescription, IOption } from './docsLibrary';

export function formatModule() {}

export function formatOption(
  option: IOption,
  with_details = false
): MarkupContent {
  const sections: string[] = [];
  if (with_details) {
    const details = getDetails(option);
    if (details) {
      sections.push(`*${details}*`);
    }
  }
  if (option.description) {
    sections.push(formatDescription(option.description, false).value);
  }
  if (option.default) {
    sections.push(`*Default*: \`${option.default}\``);
  }
  if (option.choices) {
    const formattedChoiceArray = option.choices.map((c) => `\`${c}\``);
    sections.push(`*Choices*: [${formattedChoiceArray.toString()}]`);
  }
  return {
    kind: MarkupKind.Markdown,
    value: sections.join('\n\n'),
  };
}

export function formatDescription(
  doc?: IDescription,
  asList = true
): MarkupContent {
  let result = '';
  if (doc instanceof Array) {
    const lines: string[] = [];
    doc.forEach((element) => {
      if (asList) {
        lines.push(`- ${replaceMacros(element)}`);
      } else {
        lines.push(`${replaceMacros(element)}\n`);
      }
    });
    result += lines.join('\n');
  } else if (typeof doc === 'string') {
    result += replaceMacros(doc);
  }
  return {
    kind: MarkupKind.Markdown,
    value: `${result}\n`,
  };
}

export function getDetails(option: IOption): string | undefined {
  const details = [];
  if (option.required) {
    details.push('(required)');
  }
  if (option.type) {
    if (option.type === 'list' && option.elements) {
      details.push(`list(${option.elements})`);
    } else {
      details.push(option.type);
    }
  }
  if (details) return details.join(' ');
}

// TODO: do something with links
const macroPatterns = {
  link: /L\((.*?),(.*?)\)/g,
  url: /U\((.*?)\)/g,
  reference: /R\((.*?),(.*?)\)/g,
  module: /M\((.*?)\)/g,
  monospace: /C\((.*?)\)/g,
  italics: /I\((.*?)\)/g,
  bold: /B\((.*?)\)/g,
  hr: /\bHORIZONTALLINE\b/,
};
function replaceMacros(text: string): string {
  return text
    .replace(macroPatterns.link, '[$1]($2)')
    .replace(macroPatterns.url, '$1')
    .replace(macroPatterns.reference, '[$1]($2)')
    .replace(macroPatterns.module, '*`$1`*')
    .replace(macroPatterns.monospace, '`$1`')
    .replace(macroPatterns.italics, '_$1_')
    .replace(macroPatterns.bold, '**$1**')
    .replace(macroPatterns.hr, '<hr>');
}
