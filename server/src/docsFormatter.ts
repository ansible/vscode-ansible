import { IDescription, IOption } from './docsLibrary';

export function formatDescription(doc?: IDescription, asList = true): string {
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
  return `${result}\n`;
}

export function formatOption(option: IOption): string {
  const sections: string[] = [];
  if (option.required) {
    sections.push('**Required**\n');
  }
  if (option.description) {
    sections.push(formatDescription(option.description, false));
  }
  if (option.choices) {
    const formattedChoiceArray = option.choices.map((c) => `\`${c}\``);
    sections.push(`*Choices*: [${formattedChoiceArray.toString()}]`);
  }
  return sections.join('\n');
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
