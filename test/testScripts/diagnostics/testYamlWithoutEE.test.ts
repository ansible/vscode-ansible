import * as vscode from "vscode";
import { integer } from "vscode-languageclient";
import {
  getDocUri,
  activate,
  testDiagnostics,
  updateSettings,
  waitForDiagnosisCompletion,
} from "../../helper";

export function testDiagnosticsYAMLWithoutEE(): void {
  describe("TEST FOR YAML DIAGNOSTICS WITHOUT EE", () => {
    const docUri1 = getDocUri("diagnostics/yaml/invalid_yaml.yml");

    before(async () => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    describe("YAML diagnostics in the presence of ansible-lint", () => {
      it("should provide diagnostics with YAML validation (with ansible-lint)", async () => {
        await activate(docUri1);
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, [
          {
            severity: 0,
            message: "Failed to load YAML file",
            range: new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, integer.MAX_VALUE),
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

    describe("YAML diagnostics in the absence of ansible-lint", () => {
      before(async () => {
        await updateSettings("validation.lint.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
      });

      after(async () => {
        await updateSettings("validation.lint.enabled", true); // Revert back the setting to default
      });

      it("should provide diagnostics with YAML validation (with --syntax-check)", async () => {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, [
          {
            severity: 0,
            message:
              "Syntax Error while loading YAML.\n" +
              "  mapping values are not allowed in this context\n",
            range: new vscode.Range(
              new vscode.Position(6, 21),
              new vscode.Position(6, integer.MAX_VALUE),
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

    describe("YAML diagnostics when diagnostics is disabled", () => {
      before(async () => {
        await updateSettings("validation.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
      });

      after(async () => {
        await updateSettings("validation.enabled", true); // Revert back the setting to default
      });

      it("should provide no diagnostics with invalid YAML file", async () => {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, []);
      });
    });
  });
}
