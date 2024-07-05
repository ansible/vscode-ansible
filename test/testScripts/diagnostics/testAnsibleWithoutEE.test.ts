import * as vscode from "vscode";
import { integer } from "vscode-languageclient";
import {
  getDocUri,
  activate,
  testDiagnostics,
  updateSettings,
  waitForDiagnosisCompletion,
} from "../../helper";

export function testDiagnosticsAnsibleWithoutEE(): void {
  describe("TEST FOR ANSIBLE DIAGNOSTICS WITHOUT EE", () => {
    const docUri1 = getDocUri("diagnostics/ansible/without_ee/playbook_1.yml");
    const docUri2 = getDocUri("diagnostics/ansible/without_ee/playbook_2.yml");

    before(async () => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    describe("Diagnostic test with ansible-lint", () => {
      it("should complain about no task names", async () => {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, [
          {
            severity: 0,
            message: "All tasks should be named",
            range: new vscode.Range(
              new vscode.Position(3, 0),
              new vscode.Position(3, integer.MAX_VALUE),
            ),
            source: "ansible-lint",
          },
        ]);
      });

      it("should complain about command syntax-check failed", async function () {
        await activate(docUri2);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri2, [
          {
            severity: 0,
            message:
              "The field 'hosts' has an invalid value, which includes an undefined variable.",
            range: new vscode.Range(
              new vscode.Position(0, 2),
              new vscode.Position(0, integer.MAX_VALUE),
            ),
            source: "ansible-lint",
          },
        ]);
      });
    });

    describe("Diagnostic test with ansible-syntax-check", () => {
      before(async () => {
        await updateSettings("validation.lint.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
      });

      after(async () => {
        await updateSettings("validation.lint.enabled", true); // Revert back the setting to default
      });

      it("should return no diagnostics", async function () {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, []);
      });

      it("should complain about invalid `hosts` key", async function () {
        await activate(docUri2);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri2, [
          {
            severity: 0,
            message:
              "The field 'hosts' has an invalid value, which includes an undefined variable.",
            range: new vscode.Range(
              new vscode.Position(0, 2),
              new vscode.Position(0, integer.MAX_VALUE),
            ),
            source: "Ansible",
          },
        ]);
      });
    });

    describe("Diagnostic test for no diagnostics", () => {
      before(async () => {
        await updateSettings("validation.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
      });

      after(async () => {
        await updateSettings("validation.enabled", true); // Revert back the setting to default
      });

      it("should return no diagnostics even when `hosts` key is missing", async function () {
        await activate(docUri2);
        await vscode.commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri2, []);
      });
    });
  });
}
