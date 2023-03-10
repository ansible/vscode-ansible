import * as vscode from "vscode";

export function removePromptFromSuggestion(
  suggestion: string,
  position: vscode.Position
): string {
  const lines = suggestion.split("\n");
  const editor = vscode.window.activeTextEditor;
  const cursorLine = editor?.document.lineAt(position);
  const spacesBeforeCursor =
    cursorLine?.text.slice(0, position.character).match(/^ +/)?.[0].length || 0;

  // adjust the spaces in suggestion line with respect to cursor position
  lines.forEach((line, index) => {
    if (index !== 0) {
      lines[index] = " ".repeat(spacesBeforeCursor) + line;
    }
  });
  return lines.join("\n");
}

/* A utility function to convert plain text to snippet string */
export function convertToSnippetString(suggestion: string): string {
  // this regex matches all content inside {{  }}
  // TODO: once a prefix is decided for using it in from of variable names, the regex
  // can be changed to match it
  const regex = /(?<=\{\{ ).+?(?= \}\})/gm;

  let counter = 0;
  const convertedSuggestion = suggestion.replace(regex, (item) => {
    counter = counter + 1;
    return `\${${counter}:${item}}`;
  });

  return convertedSuggestion;
}
