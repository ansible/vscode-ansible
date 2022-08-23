/* eslint-disable  @typescript-eslint/no-explicit-any */
import * as vscode from "vscode";

/**
 * This function reads the modeline config and tries to assign language to the document based on it
 * credits: https://github.com/ctlajoie/vscode-modelines/blob/master/src/modelines.ts
 *
 * @param editor textEditor
 */
export async function applyModeLines(
  editor: vscode.TextEditor | undefined
): Promise<void> {
  if (!editor || !editor.document || editor.document.isUntitled) {
    return;
  }

  if (editor.document.languageId === "ansible") {
    return;
  }

  try {
    const modelineOptions: any = searchModelines(editor.document);

    const language = modelineOptions.language;

    if (language && language.length > 0) {
      await vscode.languages.getLanguages().then((codeLangs) => {
        const codeLang = codeLangs.find(
          (codeLang) => codeLang.toLowerCase() === language.toLowerCase()
        );
        if (codeLang) {
          if (codeLang === "ansible" || codeLang === "yaml") {
            console.debug("[modelines] language set by modelines");
            vscode.languages.setTextDocumentLanguage(editor.document, codeLang);
          } else {
            vscode.window.showWarningMessage(
              'Supported languages are "ansible" and "yaml"'
            );
          }
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
}

function searchModelines(textDoc: vscode.TextDocument) {
  // vscode modeline options
  const vscodeModelineRegex = /^.{0,8}code:(.*)/;
  const vscodeModelineOptsRegex = /(\w+)=([^\s]+)/g;

  const parseOption = (name: string, value: string): any => {
    const parsedVal = _parseGenericValue(value);
    switch (name.toLowerCase()) {
      case "language":
      case "lang":
        return { language: parsedVal };
      default:
        return {};
    }
  };
  let options = {};

  const searchLines = getLinesToSearch(textDoc);
  searchLines.forEach((line) => {
    let match = line.match(vscodeModelineRegex);
    if (match) {
      const opts = match[1];
      while ((match = vscodeModelineOptsRegex.exec(opts))) {
        options = parseOption(match[1], match[2]);
      }
    }
  });
  return options;
}

function getLinesToSearch(document: vscode.TextDocument): string[] {
  // look at this number of lines at the top/bottom of the file
  const NUM_LINES_TO_SEARCH = 5;
  // don't try to find modelines on lines longer than this
  const MAX_LINE_LENGTH = 500;

  const lines = document.getText().split(/\n/g);
  let checkNumLines = NUM_LINES_TO_SEARCH;
  // avoid checking same line multiple times if file doesn't have enough lines
  if (lines.length < NUM_LINES_TO_SEARCH * 2) checkNumLines = lines.length / 2;
  const topLines = lines.slice(0, checkNumLines),
    bottomLines = lines.slice(-checkNumLines);
  return topLines
    .concat(bottomLines)
    .filter((line) => line.length <= MAX_LINE_LENGTH);
}

function _parseGenericValue(value: string): any {
  if (typeof value != "string") return value;
  value = value.trim();
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  } else if (/^[0-9]+$/.test(value)) {
    return parseInt(value, 10);
  }
  return value.replace(/['"]/g, "");
}
