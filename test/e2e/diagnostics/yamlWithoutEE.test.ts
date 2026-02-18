import * as vscode from "vscode";
import { integer } from "vscode-languageclient";
import {
  getDocUri,
  activate,
  testDiagnostics,
  waitForDiagnosticsFromSource,
} from "../e2e.utils";

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
      // Wait for ansible-lint diagnostics to appear (this test expects 5 total diagnostics)
      await waitForDiagnosticsFromSource(docUri1, "ansible-lint", 1, 10000);

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
});
