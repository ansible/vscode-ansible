import * as vscode from "vscode";
import {
  getDocUri,
  activate,
  testInlineSuggestion,
  enableLightspeedSettings,
  disableLightspeedSettings,
  canRunLightspeedTests,
  testInlineSuggestionNotTriggered,
  testInlineSuggestionCursorPositions,
  testValidJinjaBrackets,
} from "../../helper";

function testSuggestionPrompts() {
  const tests = [
    {
      taskName: "Print hello world",
      expectedModule: "ansible.builtin.debug",
    },
    {
      taskName: "Create a file foo.txt",
      expectedModule: "ansible.builtin.file",
    },
  ];

  return tests;
}

function testInvalidPrompts() {
  const tests = [
    "-name: Print hello world",
    "--name: Print hello world",
    "- -name: Print hello world",
    "-- name: Print hello world",
    "- name:",
    "- name: ",
  ];
  return tests;
}

function testInvalidCursorPosition() {
  const tests = [
    {
      taskName: "- name: Print hello world 1",
      newLineSpaces: 2,
    },
    {
      taskName: "- name: Print hello world 2",
      newLineSpaces: 6,
    },
  ];
  return tests;
}

function testSuggestionWithValidJinjaBrackets() {
  const tests = [
    {
      taskName: "Run container with podman using foo_app var",
      expectedValidJinjaInlineVar: "{{ foo_app.image }}",
    },
  ];

  return tests;
}

export function testLightspeed(): void {
  describe("TEST ANSIBLE LIGHTSPEED", function () {
    before(async function () {
      await enableLightspeedSettings();

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
        await activate(docUri1);
      });

      const tests = testSuggestionPrompts();

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should give inline suggestion for task prompt '${taskName}'`, async function () {
          await testInlineSuggestion(taskName, expectedModule);
        });
      });
    });

    describe("Test Ansible prompt not triggered", function () {
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors"
        );
        await activate(docUri1);
      });

      const tests = testInvalidPrompts();

      tests.forEach((promptName) => {
        it(`Should not give inline suggestion for task prompt '${promptName}'`, async function () {
          await testInlineSuggestionNotTriggered(promptName);
        });
      });

      const invalidCursorPosTest = testInvalidCursorPosition();
      invalidCursorPosTest.forEach(({ taskName, newLineSpaces }) => {
        it(`Should not give inline suggestion for task prompt '${taskName}' with new line spaces ${newLineSpaces}`, async function () {
          await testInlineSuggestionCursorPositions(
            taskName,
            newLineSpaces as number
          );
        });
      });
    });

    describe("Test Ansible Lightspeed inline completion suggestions", function () {
      const docUri1 = getDocUri("lightspeed/playbook_with_vars.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors"
        );
        await activate(docUri1);
      });

      const tests = testSuggestionWithValidJinjaBrackets();

      tests.forEach(({ taskName, expectedValidJinjaInlineVar }) => {
        it(`Should provide suggestion with valid jinja brackets for task prompt '${taskName}'`, async function () {
          // await testInlineSuggestion(taskName, expectedValidJinjaInlineVar);
          await testValidJinjaBrackets(taskName, expectedValidJinjaInlineVar);
        });
      });
    });

    after(async function () {
      disableLightspeedSettings();
    });
  });
}
