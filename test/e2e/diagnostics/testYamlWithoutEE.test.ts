import * as vscode from "vscode";
import { integer } from "vscode-languageclient";
import {
  getDocUri,
  activate,
  testDiagnostics,
  updateSettings,
  waitForDiagnosisCompletion,
  sleep,
} from "../../helper";

export function testDiagnosticsYAMLWithoutEE(): void {
  describe("yaml-diag-no-ee", function () {
    const docUri1 = getDocUri("diagnostics/yaml/invalid_yaml.yml");

    before(async function () {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    describe("yaml-diag-ansible-lint", function () {
      before(async function () {
        if (process.env.IS_WSL === "1") {
          this.skip();
        }
      });

      it("should provide diagnostics with YAML validation (with ansible-lint)", async function () {
        await activate(docUri1);
        console.log(
          "Extension activated, waiting for language server to be ready...",
        );

        // Wait for language server to be ready by checking for completion providers
        let serverReady = false;
        let attempts = 0;
        const maxAttempts = 20;

        while (!serverReady && attempts < maxAttempts) {
          try {
            // Try to get hover information as a test of server readiness
            const hovers = await vscode.commands.executeCommand(
              "vscode.executeHoverProvider",
              docUri1,
              new vscode.Position(0, 0),
            );
            if (hovers) {
              serverReady = true;
              console.log(
                `Language server ready after ${attempts + 1} attempts`,
              );
            }
          } catch {
            // Server not ready yet, will retry
            console.log(
              `Attempt ${attempts + 1}: Language server not ready yet`,
            );
          }

          if (!serverReady) {
            await sleep(500);
            attempts++;
          }
        }

        if (!serverReady) {
          await sleep(2000); // Give more time for the extension to be ready
          console.log("Waiting additional time for full initialization...");
        }

        console.log("Making a small edit to trigger validation...");
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await editor.edit((editBuilder) => {
            // Add a space at the end of the document to trigger validation
            const lastLine = editor.document.lineCount - 1;
            const lastLineText = editor.document.lineAt(lastLine);
            const position = new vscode.Position(
              lastLine,
              lastLineText.text.length,
            );
            editBuilder.insert(position, " ");
          });
          await sleep(100);
          await editor.edit((editBuilder) => {
            // Remove the space
            const lastLine = editor.document.lineCount - 1;
            const lastLineText = editor.document.lineAt(lastLine);
            const position = new vscode.Position(
              lastLine,
              lastLineText.text.length - 1,
            );
            const range = new vscode.Range(
              position,
              new vscode.Position(lastLine, lastLineText.text.length),
            );
            editBuilder.delete(range);
          });
        }

        console.log("Saving file to trigger diagnostics...");
        await vscode.commands.executeCommand("workbench.action.files.save");
        console.log("Waiting for diagnostics after file save...");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file
        console.log("Done waiting for diagnostics completion");
        const actualDiagnostics = vscode.languages.getDiagnostics(docUri1);
        console.log(
          `Found ${actualDiagnostics.length} diagnostics:`,
          actualDiagnostics.map((d) => ({
            message: d.message,
            source: d.source,
            severity: d.severity,
            range: d.range,
          })),
        );

        await testDiagnostics(docUri1, [
          {
            severity: 1,
            message: "Failed to load YAML file",
            range: new vscode.Range(
              new vscode.Position(6, 21),
              new vscode.Position(6, integer.MAX_VALUE),
            ),
            source: "ansible-lint",
          },
          {
            severity: 0,
            message: "Nested mappings are not allowed in compact mappings",
            range: new vscode.Range(
              new vscode.Position(6, 13),
              new vscode.Position(6, 14),
            ),
            source: "Ansible [YAML]",
          },
          {
            severity: 0,
            message: "Unexpected scalar at node end",
            range: new vscode.Range(
              new vscode.Position(7, 0),
              new vscode.Position(7, 6),
            ),
            source: "Ansible [YAML]",
          },
          {
            severity: 0,
            message: "Unexpected map-value-ind token in YAML stream",
            range: new vscode.Range(
              new vscode.Position(7, 6),
              new vscode.Position(7, 7),
            ),
            source: "Ansible [YAML]",
          },
          {
            severity: 0,
            message: "Unexpected scalar token in YAML stream",
            range: new vscode.Range(
              new vscode.Position(7, 8),
              new vscode.Position(7, 12),
            ),
            source: "Ansible [YAML]",
          },
        ]);
      });
    });

    describe("yaml-diag-no-ansible-lint", function () {
      before(async function () {
        await updateSettings("validation.lint.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
      });

      after(async function () {
        await updateSettings("validation.lint.enabled", true); // Revert back the setting to default
      });

      it("should provide diagnostics with YAML validation (with --syntax-check)", async function () {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");
        console.log("Waiting for diagnostics…");
        await waitForDiagnosisCompletion();
        console.log("Done waiting, checking diagnostics…"); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, [
          {
            severity: 0,
            message:
              "YAML parsing failed: " +
              "Colons in unquoted values must be followed by a non-space character.",
            range: new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, integer.MAX_VALUE),
            ),
            source: "Ansible",
          },
          {
            severity: 0,
            message: "Nested mappings are not allowed in compact mappings",
            range: new vscode.Range(
              new vscode.Position(6, 13),
              new vscode.Position(6, 14),
            ),
            source: "Ansible [YAML]",
          },
          {
            severity: 0,
            message: "Unexpected scalar at node end",
            range: new vscode.Range(
              new vscode.Position(7, 0),
              new vscode.Position(7, 6),
            ),
            source: "Ansible [YAML]",
          },
          {
            severity: 0,
            message: "Unexpected map-value-ind token in YAML stream",
            range: new vscode.Range(
              new vscode.Position(7, 6),
              new vscode.Position(7, 7),
            ),
            source: "Ansible [YAML]",
          },
          {
            severity: 0,
            message: "Unexpected scalar token in YAML stream",
            range: new vscode.Range(
              new vscode.Position(7, 8),
              new vscode.Position(7, 12),
            ),
            source: "Ansible [YAML]",
          },
        ]);
      });
    });

    describe("yaml-diag-disabled", function () {
      before(async function () {
        await updateSettings("validation.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
      });

      after(async function () {
        await updateSettings("validation.enabled", true); // Revert back the setting to default
      });

      it("should provide no diagnostics with invalid YAML file", async function () {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, []);
      });
    });
  });
}
