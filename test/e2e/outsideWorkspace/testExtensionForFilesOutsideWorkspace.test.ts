import { Position, Range, Uri, commands } from "vscode";
import {
  activate,
  getDocUriOutsideWorkspace,
  testDiagnostics,
  testHover,
  waitForDiagnosisCompletion,
} from "../../helper";
import { workspace } from "vscode";
import { expect } from "chai";
import { integer } from "vscode-languageclient";

export function testExtensionForFilesOutsideWorkspace() {
  describe("Test language services for a playbook that is present outside a workspace", function () {
    const playbook = "outside_workspace_playbook.yml";
    const docUri = Uri.parse(getDocUriOutsideWorkspace(playbook));

    before(async function () {
      await commands.executeCommand("workbench.action.closeAllEditors");
      await activate(docUri);
    });

    it("should confirm that file is present outside the workspace", () => {
      const docUri = Uri.parse(getDocUriOutsideWorkspace(playbook));
      const workspaceFolder = workspace.getWorkspaceFolder(docUri);
      expect(workspaceFolder).to.be.undefined;
    });

    describe("Test hover functionality", function () {
      it("should hover over `name` keyword", async () => {
        await testHover(docUri, new Position(0, 4), [
          {
            contents: [
              "Identifier. Can be used for documentation, or in tasks/handlers.",
            ],
          },
        ]);
      });

      it("should hover over builtin module name", async () => {
        await testHover(docUri, new Position(3, 10), [
          {
            contents: ["Print statements during execution"],
          },
        ]);
      });
    });

    describe("Test diagnostics functionality", function () {
      it("should complain about no task names", async () => {
        await commands.executeCommand("workbench.action.files.save");
        await waitForDiagnosisCompletion(); // Wait for the diagnostics to compute on this file

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
}
