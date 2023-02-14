import * as vscode from "vscode";

export function removePromptFromSuggestion(
  suggestion: string,
  prompt: string,
  promptDescription: string,
  position: vscode.Position
): string {
  const lines = suggestion.split("\n");
  const firstLine = lines[0].trim();
  const editor = vscode.window.activeTextEditor;
  const cursorLine = editor?.document.lineAt(position);
  const spacesBeforeCursor =
    cursorLine?.text.slice(0, position.character).match(/^ +/)?.[0].length || 0;
  if (!firstLine.startsWith(prompt.trim())) {
    // if the first line doesn't start with the prompt,
    // we don't need to remove it. Adjust the indentation
    // for the rest of the lines to account for the spaces before cursor
    // at the current line
    if (spacesBeforeCursor > 0 && lines.length > 1) {
      const newSuggestion = lines
        .map((line, index) => {
          if (index === 0) {
            return line;
          } else {
            return " ".repeat(spacesBeforeCursor) + line;
          }
        })
        .join("\n");
      return newSuggestion;
    } else {
      return suggestion;
    }
  } else {
    // if the first line starts with the prompt, remove it
    // and adjust the indentation for the rest of the lines
    const subString = firstLine.slice(prompt.trim().length);
    lines[0] = subString;
    if (subString === "") {
      lines.shift();
    } else {
      lines[0] = subString;
    }
    // adjust the spaces in suggestion line with respect to cursor position
    if (lines.length > 0) {
      const lineStartSpaceCount = lines[0].search(/\S|$/);
      if (lineStartSpaceCount > spacesBeforeCursor) {
        lines[0] = lines[0].substring(spacesBeforeCursor);
      }
    }
    return lines.join("\n");
  }
}
