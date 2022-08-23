import * as vscode from "vscode";
import { applyModeLines } from "./utils/applyModelines";

export async function configureModelines(
  context: vscode.ExtensionContext
): Promise<void> {
  // Listen for new documents being opened

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(() => {
      // apparently the window.visibleTextEditors array is not up to date at this point,
      // so we have to work around that by waiting a bit.

      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) {
        return null;
      }

      if (doc.languageId === "ansible") {
        console.debug("[modelines] language already set ansible");
        return null;
      }

      const tryApplyModelines = (): boolean => {
        const editor = vscode.window.visibleTextEditors.find(
          (e) => e.document === doc
        );
        if (editor) {
          applyModeLines(editor);
          return true;
        }
        return false;
      };

      setTimeout(() => {
        if (!tryApplyModelines()) {
          // if it's still not available, try one more time after 500ms
          setTimeout(() => {
            if (!tryApplyModelines())
              console.log("[modelines] could not find TextEditor");
          }, 500);
        }
      }, 100);
    })
  );

  // Listen for saves and change settings if necessary
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === doc
      );
      if (editor) applyModeLines(editor);
    })
  );

  setImmediate(() => applyModeLines(vscode.window.activeTextEditor));
}
