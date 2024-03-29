import * as vscode from "vscode";
import { applyFileInspectionForKeywords } from "./utils/applyFileInspectionForKeywords";
import { configureModelines, searchModelines } from "./utils/applyModelines";

/**
 * Function to dynamically set document language by inspecting the file. This is based on 2 things:
 * 1. checking the presence of 'hosts' and 'import_playbook' keyword
 * 2. checking for modelines (if any)
 *
 * If modelines is present, it is given priority over keyword check.
 *
 * @param context - The extension context
 */
export async function languageAssociation(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Listen for new documents being opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async function () {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) {
        return;
      }

      // check if modelines can be applied or not.
      const canApplyModelines =
        Object.keys(searchModelines(doc)).length === 0 ? false : true;

      if (canApplyModelines) {
        // apply modelines and return
        await configureModelines(context, doc);
        return;
      }

      const tryApplyFileInspectionForKeywords =
        async function (): Promise<boolean> {
          const editor = vscode.window.visibleTextEditors.find(
            (e) => e.document === doc,
          );
          if (editor) {
            await applyFileInspectionForKeywords(editor);
            return true;
          }
          return false;
        };

      setTimeout(async function () {
        if (!(await tryApplyFileInspectionForKeywords())) {
          // if it's still not available, try one more time after 500ms
          setTimeout(async function () {
            if (!(await tryApplyFileInspectionForKeywords()))
              console.log("[file-inspection] could not find TextEditor");
          }, 500);
        }
      }, 100);
    }),
  );

  // Listen for saves and change settings if necessary
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async function (doc) {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === doc,
      );
      if (editor) await applyFileInspectionForKeywords(editor);
    }),
  );

  setImmediate(async function () {
    await applyFileInspectionForKeywords(vscode.window.activeTextEditor);
  });
}
