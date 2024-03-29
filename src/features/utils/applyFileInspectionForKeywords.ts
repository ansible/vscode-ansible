import * as vscode from "vscode";
import * as yaml from "yaml";

export async function applyFileInspectionForKeywords(
  editor: vscode.TextEditor | undefined,
): Promise<void> {
  if (!editor || !editor.document || editor.document.isUntitled) {
    return;
  }

  try {
    const fileType = editor.document.fileName.split(".").pop();

    if (fileType !== "yaml" && fileType !== "yml") {
      return;
    }

    const fileText = editor.document.getText();
    const parsedYaml = fileText ? yaml.parse(fileText) : "";

    if (parsedYaml && Array.isArray(parsedYaml)) {
      // Check for all seq
      const topLevelKeys = Object.keys(parsedYaml[0]);
      const ansibleTopLevelKeys = ["hosts", "import_playbook"];

      const found = ansibleTopLevelKeys.some(
        (key) => topLevelKeys.indexOf(key) >= 0,
      );

      if (found) {
        console.log("[file-inspection] language set by file inspection");
        await vscode.languages.setTextDocumentLanguage(
          editor.document,
          "ansible",
        );
      }
    }
  } catch (err) {
    console.error("Error loading yaml file");
  }
}
