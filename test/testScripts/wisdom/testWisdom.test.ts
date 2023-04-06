import * as vscode from "vscode";
import {
  getDocUri,
  activate,
  testInlineSuggestion,
  enableWisdomSettings,
  disableWisdomSettings,
} from "../../helper";

function testSuggestionPrompts() {
  const tests = [
    {
      taskName: "Print hello world",
      expectedModule: "ansible.builtin.debug",
    },
    {
      taskName: "Create a file foo.txt",
      expectedModule: "ansible.builtin.copy",
    },
  ];

  return tests;
}

export function testWisdom(): void {
  describe("TEST PROJECT WISDOM", function () {
    before(async function () {
      // if env variable with test token is not loaded, skip the wisdom tests
      if (!process.env.TEST_WISDOM_ACCESS_TOKEN) {
        console.warn(
          "Skipping wisdom tests because TEST_WISDOM_ACCESS_TOKEN variable is not set."
        );
        this.skip();
      }
    });

    describe("Test Project Wisdom inline completion suggestions", function () {
      const docUri1 = getDocUri("wisdom/playbook_1.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors"
        );
        await enableWisdomSettings();
        await activate(docUri1);
      });

      const tests = testSuggestionPrompts();

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should give inline suggestion for task prompt '${taskName}'`, async function () {
          await testInlineSuggestion(taskName, expectedModule);
        });
      });
    });

    after(async function () {
      disableWisdomSettings();
    });
  });
}
