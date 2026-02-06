import { Position, Range, Uri, commands } from "vscode";
import {
  activate,
  getDocUriOutsideWorkspace,
  testDiagnostics,
  testHover,
  waitForDiagnosisCompletion,
} from "../e2e.utils";
import { workspace } from "vscode";
import { expect } from "chai";
import { integer } from "vscode-languageclient";

describe("language services for a playbook that is present outside a workspace", function () {
  const playbook = "outside_workspace_playbook.yml";
  const docUri = Uri.parse(getDocUriOutsideWorkspace(playbook));

  before(async function () {
    await commands.executeCommand("workbench.action.closeAllEditors");
    await activate(docUri);
  });

  it("should confirm that file is present outside the workspace", function () {
    const docUri = Uri.parse(getDocUriOutsideWorkspace(playbook));
    const workspaceFolder = workspace.getWorkspaceFolder(docUri);
    expect(workspaceFolder).to.be.undefined;
  });

  describe("hover functionality", function () {
    it("should hover over `name` keyword", async function () {
      await testHover(docUri, new Position(0, 4), [
        {
          contents: [
            "Identifier. Can be used for documentation, or in tasks/handlers.",
          ],
        },
      ]);
    });

    it("should hover over builtin module name", async function () {
      await testHover(docUri, new Position(3, 10), [
        {
          contents: ["Print statements during execution"],
        },
      ]);
    });
  });

  describe("diagnostics functionality", function () {
    it("should complain about no task names", async function () {
      await commands.executeCommand("workbench.action.files.save");
      // Use longer timeout and quickCheckTimeout for lint tests since ansible-lint
      // may take time to start, especially on WSL
      await waitForDiagnosisCompletion(150, 7000, 3000);

      await testDiagnostics(docUri, [
        {
          severity: 0,
          message: "All tasks should be named.",
          range: new Range(
            new Position(3, 0),
            new Position(3, integer.MAX_VALUE),
          ),
          source: "ansible-lint",
        },
      ]);
    });
  });

  after(async function () {
    await commands.executeCommand("workbench.action.closeAllEditors");
  });
});
