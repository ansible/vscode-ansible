/* eslint-disable quotes */
import * as vscode from "vscode";
import { integer } from "vscode-languageclient";
import {
  getDocUri,
  activate,
  testDiagnostics,
  sleep,
  updateSettings,
} from "../../helper";

export function testDiagnosticsAnsibleWithoutEE(): void {
  describe("TEST FOR ANSIBLE DIAGNOSTICS WITHOUT EE", () => {
    const docUri1 = getDocUri("diagnostics/ansible/without_ee/1.yml");
    const docUri2 = getDocUri("diagnostics/ansible/without_ee/2.yml");

    before(async () => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });

    describe("Diagnostic test with ansible-lint", () => {
      it("should complain about no task names", async () => {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");

        await sleep(1000); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, [
          {
            severity: 0,
            message: "All tasks should be named",
            range: new vscode.Range(
              new vscode.Position(3, 0),
              new vscode.Position(3, integer.MAX_VALUE)
            ),
            source: "Ansible",
          },
        ]);
      });

      it("should complain about command syntax-check failed", async function () {
        await activate(docUri2);
        await vscode.commands.executeCommand("workbench.action.files.save");

        await sleep(1000); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri2, [
          {
            severity: 0,
            message: "Ansible syntax check failed",
            range: new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, integer.MAX_VALUE)
            ),
            source: "Ansible",
          },
        ]);
      });
    });

    describe("Diagnostic test with ansible-syntax-check", () => {
      before(async () => {
        await updateSettings("ansibleLint.enabled", false);
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors"
        );
      });

      after(async () => {
        await updateSettings("ansibleLint.enabled", true); // Revert back the setting to default
      });

      it("should return no diagnostics", async function () {
        await activate(docUri1);
        await vscode.commands.executeCommand("workbench.action.files.save");

        await sleep(1000); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, []);
      });

      it("should complain about missing `hosts` key", async function () {
        await activate(docUri2);
        await vscode.commands.executeCommand("workbench.action.files.save");

        await sleep(1000); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri2, [
          {
            severity: 0,
            message: "the field 'hosts' is required but was not set",
            range: new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(0, integer.MAX_VALUE)
            ),
            source: "Ansible",
          },
        ]);
      });
    });
  });
}
