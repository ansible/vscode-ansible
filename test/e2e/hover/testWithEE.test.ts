import * as vscode from "vscode";
import {
  getDocUri,
  activate,
  testHover,
  setFixtureAnsibleCollectionPathEnv,
} from "../../helper";

export function testHoverEE(): void {
  describe("TEST FOR HOVER (WITH EE)", () => {
    const docUri1 = getDocUri("hover/with_ee/1.yml");

    before(async () => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await activate(docUri1);
      setFixtureAnsibleCollectionPathEnv(
        "/home/runner/.ansible/collections:/usr/share/ansible/collections",
      );
    });

    describe("Hover for play keywords", () => {
      it("should hover over `name` keyword", async () => {
        await testHover(docUri1, new vscode.Position(0, 4), [
          {
            contents: [
              "Identifier. Can be used for documentation, or in tasks/handlers.",
            ],
          },
        ]);
      });

      it("should hover over `hosts` keyword", async () => {
        await testHover(docUri1, new vscode.Position(2, 4), [
          {
            contents: [
              "A list of groups, hosts or host pattern that translates into a list of hosts that are the play’s target.",
            ],
          },
        ]);
      });

      it("should hover over `tasks` keyword", async () => {
        await testHover(docUri1, new vscode.Position(3, 4), [
          {
            contents: [
              "Main list of tasks to execute in the play, they run after roles and before post_tasks.",
            ],
          },
        ]);
      });
    });

    describe("Hover for builtin module name and options", () => {
      it("should hover over builtin module name", async () => {
        await testHover(docUri1, new vscode.Position(5, 7), [
          {
            contents: ["Print statements during execution"],
          },
        ]);
      });

      it("should hover over builtin module option", async () => {
        await testHover(docUri1, new vscode.Position(6, 9), [
          {
            contents: ["customized message"],
          },
        ]);
      });
    });

    describe("Hover for module name and options present in the EE", () => {
      it("should hover over collection module name present in EE (ansible.posix.patch)", async () => {
        await testHover(docUri1, new vscode.Position(9, 7), [
          {
            contents: ["GNU patch"],
          },
        ]);
      });

      it("should hover over collection module option present in EE (ansible.posix.patch -> src)", async () => {
        await testHover(docUri1, new vscode.Position(10, 9), [
          {
            contents: ["GNU patch"],
          },
        ]);
      });

      it("should hover over collection module option present in EE (ansible.posix.patch -> dest)", async () => {
        await testHover(docUri1, new vscode.Position(11, 9), [
          {
            contents: ["remote machine"],
          },
        ]);
      });
    });

    describe("Hover for module name and options absent in the EE", () => {
      it("should not hover over collection module name present in EE (vyos.vyos.vyos_prefix_list)", async () => {
        await testHover(docUri1, new vscode.Position(14, 8), []);
      });

      it("should not hover over collection module option present in EE (vyos.vyos.vyos_prefix_list -> config)", async () => {
        await testHover(docUri1, new vscode.Position(15, 10), []);
      });
    });
  });
}
