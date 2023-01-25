import * as vscode from "vscode";

export function removePromptFromSuggestion(
  suggestion: string,
  prompt: string,
  position: vscode.Position
): string {
  const lines = suggestion.split("\n");
  const firstLine = lines[0].trim();
  if (!firstLine.startsWith(prompt.trim())) {
    return suggestion;
  }

  const subString = firstLine.slice(prompt.trim().length);
  lines[0] = subString;
  if (subString === "") {
    lines.shift();
  } else {
    lines[0] = subString;
  }
  // adjust the spaces in suggestion line with respect to cursor position
  if (lines.length > 0) {
    const editor = vscode.window.activeTextEditor;
    const cursorLine = editor?.document.lineAt(position);
    const spacesBeforeCursor =
      cursorLine?.text.slice(0, position.character).match(/^ +/)?.[0].length ||
      0;

    const lineStartSpaceCount = lines[0].search(/\S|$/);
    if (lineStartSpaceCount > spacesBeforeCursor) {
      lines[0] = lines[0].substring(spacesBeforeCursor);
    }
  }
  return lines.join("\n");
}
