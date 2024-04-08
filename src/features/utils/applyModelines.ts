/* eslint-disable  @typescript-eslint/no-explicit-any */
import * as vscode from "vscode";

export async function configureModelines(
  context: vscode.ExtensionContext,
  doc: vscode.TextDocument,
): Promise<void> {
  // Listen for new documents being opened

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(() => {
      // apparently the window.visibleTextEditors array is not up to date at this point,
      // so we have to work around that by waiting a bit.

      const tryApplyModelines = async (): Promise<boolean> => {
        const editor = vscode.window.visibleTextEditors.find(
          (e) => e.document === doc,
        );
        if (editor) {
          await applyModeLines(editor);
          return true;
        }
        return false;
      };

      setTimeout(async () => {
        if (!(await tryApplyModelines())) {
          // if it's still not available, try one more time after 500ms
          setTimeout(async () => {
            if (!(await tryApplyModelines()))
              console.log("[modelines] could not find TextEditor");
          }, 500);
        }
      }, 100);
    }),
  );

  // Listen for saves and change settings if necessary
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === doc,
      );
      if (editor) await applyModeLines(editor);
    }),
  );

  setImmediate(
    async () => await applyModeLines(vscode.window.activeTextEditor),
  );
}

/**
 * This function reads the modeline config and tries to assign language to the document based on it
 * credits: https://github.com/ctlajoie/vscode-modelines/blob/master/src/modelines.ts
 *
 * @param editor - textEditor
 */
export async function applyModeLines(
  editor: vscode.TextEditor | undefined,
): Promise<void> {
  if (!editor || !editor.document || editor.document.isUntitled) {
    return;
  }

  try {
    const modelineOptions: any = searchModelines(editor.document);

    const language = modelineOptions.language;

    if (language && language.length > 0) {
      if (language === "ansible" || language === "yaml") {
        console.log("[modelines] language set by modelines");
        await vscode.languages.setTextDocumentLanguage(
          editor.document,
          language,
        );
      } else {
        vscode.window.showWarningMessage(
          'Supported languages are "ansible" and "yaml"',
        );
      }
    }
  } catch (err) {
    console.error(err);
  }
}

export function searchModelines(textDoc: vscode.TextDocument) {
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
