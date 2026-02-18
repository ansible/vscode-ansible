import * as vscode from "vscode";
import { integer } from "vscode-languageclient";
import {
  getDocUri,
  activate,
  testDiagnostics,
  updateSettings,
  waitForDiagnosticsFromSource,
  clearActivationCache,
  sleep,
} from "../e2e.utils";

describe("ansible-diag-no-ee", function () {
  const docUri1 = getDocUri("diagnostics/ansible/without_ee/playbook_1.yml");
  const docUri2 = getDocUri("diagnostics/ansible/without_ee/playbook_2.yml");

  before(async function () {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  describe("Diagnostic test with ansible-lint", function () {
    before(async function () {
      await updateSettings("validation.lint.enabled", true);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await sleep(2000);
      // Give language server time to process document close and settings change
      await new Promise((resolve) => setTimeout(resolve, 500));
      clearActivationCache(); // Clear cache after editors closed
    });

    after(async function () {
      await updateSettings("validation.lint.enabled", true); // Keep enabled for other tests
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      clearActivationCache(); // Clear cache after editors closed
    });

    it("should complain about no task names", async function () {
      await activate(docUri1);
      await vscode.commands.executeCommand("workbench.action.files.save");
      // Wait for ansible-lint diagnostics directly instead of relying on process detection
      // which is unreliable on WSL. Use a generous timeout for slow CI environments.
      await waitForDiagnosticsFromSource(docUri1, "ansible-lint", 1, 15000);

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
      // Wait for ansible-lint diagnostics directly instead of relying on process detection
      await waitForDiagnosticsFromSource(docUri2, "ansible-lint", 1, 15000);

      await testDiagnostics(docUri2, [
        {
          severity: 0,
          message: "Error processing keyword 'hosts': 'my_hosts' is undefined",
          range: new vscode.Range(
            new vscode.Position(1, 9),
            new vscode.Position(1, integer.MAX_VALUE),
          ),
          source: "ansible-lint",
        },
      ]);
    });
  });
});
