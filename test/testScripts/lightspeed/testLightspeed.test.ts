import * as vscode from "vscode";
import sinon from "sinon";
import { assert } from "chai";
import {
  getDocUri,
  activate,
  testInlineSuggestion,
  enableLightspeedSettings,
  disableLightspeedSettings,
  canRunLightspeedTests,
  resetInlineSuggestionsWaitWindow,
  setInlineSuggestionsWaitWindow,
  testInlineSuggestionNotTriggered,
  testInlineSuggestionCursorPositions,
  testValidJinjaBrackets,
} from "../../helper";
import { testLightspeedFunctions } from "./testLightSpeedFunctions.test";
import { testLightspeedUser } from "./testLightspeedUser.test";
import { lightSpeedManager } from "../../../src/extension";
import {
  testInlineSuggestionByAnotherProvider,
  testInlineSuggestionProviderCoExistence,
  testIgnorePendingSuggestion,
} from "./e2eInlineSuggestion.test";
import {
  UserAction,
  LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT,
} from "../../../src/definitions/lightspeed";
import { FeedbackRequestParams } from "../../../src/interfaces/lightspeed";

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

function testSuggestionExpectedInsertTexts() {
  // Based on the responses defined in the mock lightspeed server codes
  const insertTexts = [
    `  ${LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT}      ansible.builtin.debug:\n        msg: Hello World\n    `,
    `  ${LIGHTSPEED_SUGGESTION_GHOST_TEXT_COMMENT}      ansible.builtin.file:\n        path: ~/foo.txt\n        state: touch\n    `,
  ];

  return insertTexts;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let feedbackRequestSpy: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let isAuthenticatedStub: any;
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
        await activate(docUri1);
        feedbackRequestSpy = sinon.spy(
          lightSpeedManager.apiInstance,
          "feedbackRequest",
        );
        isAuthenticatedStub = sinon.stub(
          lightSpeedManager.lightspeedAuthenticatedUser,
          "isAuthenticated",
        );
        isAuthenticatedStub.returns(Promise.resolve(true));
      });

      const tests = testSuggestionPrompts();
      const expectedInsertTexts = testSuggestionExpectedInsertTexts();

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should give inline suggestion for task prompt '${taskName}'`, async function () {
          await testInlineSuggestion(taskName, expectedModule);
          const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
          assert.equal(feedbackRequestApiCalls.length, 1);
          const inputData: FeedbackRequestParams =
            feedbackRequestSpy.args[0][0];
          assert(inputData?.inlineSuggestion?.action === UserAction.ACCEPTED);
          const ret = feedbackRequestSpy.returnValues[0];
          assert(Object.keys(ret).length === 0); // ret should be equal to {}
        });
      });

      tests.map((test, i) => {
        const { taskName, expectedModule } = test;
        it(`Should send inlineSuggestionFeedback with expected text changes for task prompt '${taskName}'`, async function () {
          await testInlineSuggestion(
            taskName,
            expectedModule,
            false,
            expectedInsertTexts[i],
          );
          const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
          assert.equal(feedbackRequestApiCalls.length, 1);
          const inputData: FeedbackRequestParams =
            feedbackRequestSpy.args[0][0];
          assert(inputData?.inlineSuggestion?.action === UserAction.ACCEPTED);
          const ret = feedbackRequestSpy.returnValues[0];
          assert(Object.keys(ret).length === 0); // ret should be equal to {}
        });
      });

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should send inlineSuggestionFeedback(REJECTED) with cursor movement for task prompt '${taskName}'`, async function () {
          await testInlineSuggestion(taskName, expectedModule, false, "", true);
          const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
          assert.equal(feedbackRequestApiCalls.length, 1);
          const inputData: FeedbackRequestParams =
            feedbackRequestSpy.args[0][0];
          assert(
            inputData?.inlineSuggestion?.action === UserAction.REJECTED,
            JSON.stringify(inputData, null),
          );
          const ret = feedbackRequestSpy.returnValues[0];
          assert(
            Object.keys(ret).length === 0,
            JSON.stringify(inputData, null),
          ); // ret should be equal to {}
        });
      });

      afterEach(() => {
        feedbackRequestSpy.resetHistory();
      });

      after(async function () {
        feedbackRequestSpy.restore();
        isAuthenticatedStub.restore();
      });
    });

    describe("Test Ansible Lightspeed multitask inline completion suggestions", function () {
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rhUserHasSeatStub: any;

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
        await activate(docUri1);
        rhUserHasSeatStub = sinon.stub(
          lightSpeedManager.lightspeedAuthenticatedUser,
          "rhUserHasSeat",
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
        rhUserHasSeatStub.restore();
      });
    });

    describe("Test Ansible Lightspeed inline completion suggestions with keeping typing", function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let feedbackRequestSpy: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let completionRequestSpy: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let isAuthenticatedStub: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rhUserHasSeatStub: any;
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
        await activate(docUri1);
        feedbackRequestSpy = sinon.spy(
          lightSpeedManager.apiInstance,
          "feedbackRequest",
        );
        completionRequestSpy = sinon.spy(
          lightSpeedManager.apiInstance,
          "completionRequest",
        );
        isAuthenticatedStub = sinon.stub(
          lightSpeedManager.lightspeedAuthenticatedUser,
          "isAuthenticated",
        );
        rhUserHasSeatStub = sinon.stub(
          lightSpeedManager.lightspeedAuthenticatedUser,
          "rhUserHasSeat",
        );
        isAuthenticatedStub.returns(Promise.resolve(true));
      });

      const tests = testSuggestionPrompts();
      const multiTaskTests = testMultiTaskSuggestionPrompts();

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should return an inline feedback with action=IGNORED '${taskName}'`, async function () {
          await testInlineSuggestion(
            taskName,
            expectedModule,
            false,
            "",
            true,
            true,
          );
          const completionRequestApiCalls = completionRequestSpy.getCalls();
          assert.equal(completionRequestApiCalls.length, 1);
          const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
          assert.equal(feedbackRequestApiCalls.length, 1);
          const inputData: FeedbackRequestParams =
            feedbackRequestSpy.args[0][0];
          assert(inputData?.inlineSuggestion?.action === UserAction.IGNORED);
          const ret = feedbackRequestSpy.returnValues[0];
          assert(Object.keys(ret).length === 0); // ret should be equal to {}
        });
      });

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should not call completion API with a keystroke before Wait Window '${taskName}'`, async function () {
          try {
            await setInlineSuggestionsWaitWindow();
            await testInlineSuggestion(
              taskName,
              expectedModule,
              false,
              "",
              true,
              true,
            );
            const completionRequestApiCalls = completionRequestSpy.getCalls();
            assert.equal(completionRequestApiCalls.length, 0);
            const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
            assert.equal(feedbackRequestApiCalls.length, 0);
          } finally {
            await resetInlineSuggestionsWaitWindow();
          }
        });
      });

      multiTaskTests.forEach(({ taskName, expectedModule }) => {
        it(`Should not call completion API with a keystroke before Wait Window (multi task) '${taskName}'`, async function () {
          try {
            rhUserHasSeatStub.returns(Promise.resolve(true));
            await setInlineSuggestionsWaitWindow();
            await testInlineSuggestion(
              taskName,
              expectedModule,
              true,
              "",
              true,
              true,
            );
            const completionRequestApiCalls = completionRequestSpy.getCalls();
            assert.equal(completionRequestApiCalls.length, 0);
            const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
            assert.equal(feedbackRequestApiCalls.length, 0);
          } finally {
            await resetInlineSuggestionsWaitWindow();
          }
        });
      });

      tests.forEach(({ taskName, expectedModule }) => {
        it(`Should return an inline feedback '${taskName}'`, async function () {
          await testInlineSuggestion(
            // with the mock lightspeed server, adding "status=nnn" to prompt will
            // return the specified status code in the response
            `${taskName} (status=204)`,
            expectedModule,
            false,
            "",
            true,
            true,
          );
          const completionRequestApiCalls = completionRequestSpy.getCalls();
          assert.equal(completionRequestApiCalls.length, 1);
          const feedbackRequestApiCalls = feedbackRequestSpy.getCalls();
          assert.equal(feedbackRequestApiCalls.length, 1);
        });
      });

      afterEach(() => {
        feedbackRequestSpy.resetHistory();
        completionRequestSpy.resetHistory();
      });

      after(async function () {
        feedbackRequestSpy.restore();
        completionRequestSpy.restore();
        isAuthenticatedStub.restore();
        rhUserHasSeatStub.restore();
        sinon.restore();
      });
    });

    describe("Test Ansible prompt not triggered", function () {
      const docUri1 = getDocUri("lightspeed/playbook_1.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
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
            newLineSpaces as number,
          );
        });
      });
    });

    describe("Test Ansible Lightspeed inline completion suggestions with Jinja brackets", function () {
      const docUri1 = getDocUri("lightspeed/playbook_with_vars.yml");

      before(async function () {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
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

    describe("Test ignore pending suggestions", () => {
      testIgnorePendingSuggestion();
    });

    describe("Test inline suggestion by another provider", () => {
      testInlineSuggestionByAnotherProvider();
      testInlineSuggestionProviderCoExistence();
    });

    describe("Test Ansible Lightspeed Functions", function () {
      testLightspeedFunctions();
    });

    describe("Test LightspeedUser", function () {
      testLightspeedUser();
    });

    after(async function () {
      disableLightspeedSettings();
    });
  });
}
