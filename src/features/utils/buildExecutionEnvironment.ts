import * as vscode from "vscode";
import { spawnSync } from "child_process";

export function rightClickEEBuildCommand(commandId: string): vscode.Disposable {
  return vscode.commands.registerCommand(commandId, (uri: vscode.Uri) => {
    if (!uri || !uri.fsPath) {
      vscode.window.showErrorMessage("No file selected!");
      return;
    }

    const filePath = uri.fsPath;
    const dirPath = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;

    const command = "ansible-builder";
    const args = ["build", "-f", filePath];

    vscode.window.showInformationMessage(
      `Running: ${command} ${args.join(" ")}`,
    );

    if (!dirPath) {
      vscode.window.showErrorMessage("Could not determine workspace folder.");
      return;
    }

    try {
      const result = spawnSync(command, args, {
        cwd: dirPath,
        env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin" },
        encoding: "utf-8",
        shell: false,
      });

      if (result.error) {
        vscode.window.showErrorMessage(`Build failed: ${result.error.message}`);
        return;
      }

      if (result.stderr) {
        vscode.window.showErrorMessage(`Error: ${result.stderr}`);
        return;
      }

      vscode.window.showInformationMessage(
        `Build successful:\n${result.stdout}`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unexpected error: ${(error as Error).message}`,
      );
    }
  });
}
