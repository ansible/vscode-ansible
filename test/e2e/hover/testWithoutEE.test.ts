import * as vscode from "vscode";
import { getDocUri, activate, testHover } from "../../helper";

export function testHoverWithoutEE(): void {
  describe("TEST FOR HOVER WITHOUT EE", () => {
    const docUri1 = getDocUri("hover/without_ee/1.yml");

    before(async () => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await activate(docUri1);
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

    describe("Hover for task keywords", () => {
      it("should hover over builtin module name", async () => {
        await testHover(docUri1, new vscode.Position(5, 7), [
          {
            contents: ["Print statements during execution"],
          },
        ]);
      });

      it("should hover over collection module name", async () => {
        await testHover(docUri1, new vscode.Position(9, 7), [
          {
            contents: ["Test module"],
          },
        ]);
      });

      it("should hover over task keyword", async () => {
        await testHover(docUri1, new vscode.Position(25, 7), [
          {
            contents: [
              "Name of variable that will contain task status and module return data.",
            ],
          },
        ]);
      });
    });

    describe("Hover for module options and sub-options", () => {
      it("should hover over builtin module option", async () => {
        await testHover(docUri1, new vscode.Position(6, 9), [
          {
            contents: ["customized message"],
          },
        ]);
      });

      it("should hover over collection module option (opt_1)", async () => {
        await testHover(docUri1, new vscode.Position(10, 9), [
          {
            contents: ["Option 1"],
          },
        ]);
      });

      it("should hover over collection module sub-option (opt_1 -> sub_opt_1)", async () => {
        await testHover(docUri1, new vscode.Position(14, 13), [
          {
            contents: ["Sub option 1"],
          },
        ]);
      });

      it("should hover over collection module sub-option (opt_1 -> sub_opt_2 -> sub_sub_opt_2)", async () => {
        await testHover(docUri1, new vscode.Position(17, 17), [
          {
            contents: ["Sub sub option 2"],
          },
        ]);
      });

      it("should hover over collection module sub-option (opt_1 -> sub_opt_2 -> sub_sub_opt_2 -> sub_sub_sub_opt_1)", async () => {
        await testHover(docUri1, new vscode.Position(19, 21), [
          {
            contents: ["Sub sub sub option 1"],
          },
        ]);
      });
    });
  });
}
