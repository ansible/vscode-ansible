import * as vscode from "vscode";
import {
  getDocUri,
  activate,
  testInlineSuggestion,
  enableLightspeedSettings,
  disableLightspeedSettings,
  canRunLightspeedTests,
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

export function testLightspeed(): void {
  describe("TEST ANSIBLE LIGHTSPEED", function () {
    before(async function () {
      // check if we can run lightspeed tests or not> If not, skip the tests
      if (!(await canRunLightspeedTests())) {
        this.skip();
      }
    });

    describe("Test Ansible Lightspeed inline completion suggestions", function () {
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors"
        );
        await enableLightspeedSettings();
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
      disableLightspeedSettings();
    });
  });
}
