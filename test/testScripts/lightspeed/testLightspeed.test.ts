import * as vscode from "vscode";
import sinon from "sinon";
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
import { testLightspeedFunctions } from "./testLightSpeedFunctions.test";
import { lightSpeedManager } from "../../../src/extension";
import { testInlineSuggestionByAnotherProvider } from "./e2eInlineSuggestion.test";

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

function testMultiTaskSuggestionPrompts() {
  const tests = [
    {
      taskName: "Install vim & install python3 & debug OS version",
      expectedModule: "ansible.builtin.package",
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

    describe("Test Ansible Lightspeed multitask inline completion suggestions", function () {
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rhUserHasSeatStub: any;

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors"
        );
        await activate(docUri1);
        rhUserHasSeatStub = sinon.stub(
          lightSpeedManager.lightSpeedAuthenticationProvider,
          "rhUserHasSeat"
        );
      });

      const tests = testMultiTaskSuggestionPrompts();

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should give multitask inline suggestion for task prompt '${taskName}'`, async function () {
          rhUserHasSeatStub.returns(Promise.resolve(true));
          await testInlineSuggestion(taskName, expectedModule, true);
        });

        it(`Should not give multitask inline suggestion for task prompt '${taskName}' if the user is unseated`, async function () {
          rhUserHasSeatStub.returns(Promise.resolve(false));
          await testInlineSuggestionNotTriggered(taskName, true);
        });
      });

      after(async function () {
        sinon.restore();
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

    describe("Test inline suggestion by another provider", () => {
      testInlineSuggestionByAnotherProvider();
    });

    describe("Test Ansible Lightspeed Functions", function () {
      testLightspeedFunctions();
    });

    after(async function () {
      disableLightspeedSettings();
    });
  });
}
