import * as vscode from "vscode";
import { withInterpreter } from "../utils/commandRunner";
import { SettingsManager } from "../../settings";
import { runCommand } from "../contentCreator/utils";

export function rightClickEEBuildCommand(commandId: string): vscode.Disposable {
  return vscode.commands.registerCommand(commandId, async (uri: vscode.Uri) => {
    if (!uri?.fsPath) {
      vscode.window.showErrorMessage("No file selected!");
      return;
    }

    const filePath = uri.fsPath;
    const dirPath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;

    const builderCommand = `ansible-builder build -f ${filePath} -c ${dirPath}/context`;

    vscode.window.showInformationMessage(`Running: ${builderCommand}`);

    if (!dirPath) {
      vscode.window.showErrorMessage("Could not determine workspace folder.");
      return;
    }

    try {
      const extSettings = new SettingsManager();
      await extSettings.initialize();

      const { command, env } = withInterpreter(
        extSettings.settings,
        builderCommand,
        "",
      );

      const result = await runCommand(command, env);

      if (result.status === "failed") {
        vscode.window.showErrorMessage(
          `Build failed with status ${result.status}: \n${result.output.trim()}`,
        );
        return;
      }

      vscode.window.showInformationMessage(
        `Build successful:\n${result.output.trim()}`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unexpected error: ${(error as Error).message}`,
      );
    }
  });
}
