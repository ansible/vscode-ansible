// Function-level tests for Lightspeed
import sinon from "sinon";
import { getLoggedInUserDetails } from "../../../src/features/lightspeed/utils/webUtils";
import { LightspeedUserDetails } from "../../../src/interfaces/lightspeed";
import { lightSpeedManager } from "../../../src/extension";
import { assert } from "chai";
import { LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT } from "../../../src/definitions/lightspeed";
import {
  findTasks,
  isPlaybook,
} from "../../../src/features/lightspeed/playbookExplanation";
import * as inlineSuggestions from "../../../src/features/lightspeed/inlineSuggestions";

function getLightSpeedUserDetails(
  rhUserHasSeat: boolean,
  rhOrgHasSubscription: boolean,
  rhUserIsOrgAdmin: boolean = false,
): LightspeedUserDetails {
  return {
    rhUserHasSeat: rhUserHasSeat,
    rhOrgHasSubscription: rhOrgHasSubscription,
    rhUserIsOrgAdmin: rhUserIsOrgAdmin,
    displayName: "jane_doe",
    displayNameWithUserType: "jane_doe (unlicensed)",
    orgOptOutTelemetry: false,
  };
}

function testGetLoggedInUserDetails(): void {
  describe("Test getLoggedInUserDetails", function () {
    it(`Verify a seated user`, function () {
      const session = getLightSpeedUserDetails(true, true, false);
      const { userInfo } = getLoggedInUserDetails(session);
      assert.equal(userInfo?.userType, "Licensed");
      assert.isTrue(userInfo?.subscribed);
      assert.isUndefined(userInfo?.role);
    });

    it(`Verify an unseated user`, function () {
      const session = getLightSpeedUserDetails(false, true, false);
      const { userInfo } = getLoggedInUserDetails(session);
      assert.equal(userInfo?.userType, "Unlicensed");
      assert.isTrue(userInfo?.subscribed);
      assert.isUndefined(userInfo?.role);
    });

    it(`Verify an unseated user of an unsubscribed org`, function () {
      const session = getLightSpeedUserDetails(false, false, false);
      const { userInfo } = getLoggedInUserDetails(session);
      assert.equal(userInfo?.userType, "Unlicensed");
      assert.isNotTrue(userInfo?.subscribed);
      assert.isUndefined(userInfo?.role);
    });

    it(`Verify a seated administrator`, function () {
      const session = getLightSpeedUserDetails(true, true, true);
      const { userInfo } = getLoggedInUserDetails(session);
      assert.equal(userInfo?.userType, "Licensed");
      assert.isTrue(userInfo?.subscribed);
      assert.equal(userInfo?.role, "Administrator");
    });
  });
}

function testGetLightSpeedStatusBarText(): void {
  describe("Test getLightSpeedStatusBarTest", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let getLightspeedUserDetailsStub: any;

    before(async function () {
      getLightspeedUserDetailsStub = sinon.stub(
        lightSpeedManager.lightspeedAuthenticatedUser,
        "getLightspeedUserDetails",
      );
    });
    after(async function () {
      getLightspeedUserDetailsStub.restore();
    });

    it("Verify status bar text for various user types", async function () {
      const statusBarProvider = lightSpeedManager.statusBarProvider;

      getLightspeedUserDetailsStub.returns(Promise.resolve(undefined));
      let text = await statusBarProvider.getLightSpeedStatusBarText();
      assert.equal(text, LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT);

      getLightspeedUserDetailsStub.returns(
        Promise.resolve(getLightSpeedUserDetails(true, true)),
      );
      text = await statusBarProvider.getLightSpeedStatusBarText();
      assert.equal(text, "Lightspeed (licensed)");

      getLightspeedUserDetailsStub.returns(
        Promise.resolve(getLightSpeedUserDetails(true, false)),
      );
      text = await statusBarProvider.getLightSpeedStatusBarText();
      assert.equal(text, "Lightspeed (unlicensed)");

      getLightspeedUserDetailsStub.returns(
        Promise.resolve(getLightSpeedUserDetails(false, true)),
      );
      text = await statusBarProvider.getLightSpeedStatusBarText();
      assert.equal(text, "Lightspeed (unlicensed)");

      getLightspeedUserDetailsStub.returns(
        Promise.resolve(getLightSpeedUserDetails(false, false)),
      );
      text = await statusBarProvider.getLightSpeedStatusBarText();
      assert.equal(text, "Lightspeed (unlicensed)");
    });
  });
}

function testFeedbackCompletionAPI(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let isAuthenticated: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inlineSuggestionHideHandlerSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cancelSuggestionFeedbackSpy: any;

  before(async function () {
    isAuthenticated = sinon.stub(
      lightSpeedManager.lightspeedAuthenticatedUser,
      "isAuthenticated",
    );
    isAuthenticated.returns(Promise.resolve(true));
    inlineSuggestionHideHandlerSpy = sinon.spy(
      inlineSuggestions,
      "inlineSuggestionHideHandler",
    );
    cancelSuggestionFeedbackSpy = sinon.stub(
      lightSpeedManager.apiInstance,
      "cancelSuggestionFeedback",
    );
  });

  beforeEach(async function () {
    cancelSuggestionFeedbackSpy.returns(true);
  });

  describe("Test Feedback API", function () {
    it("Verify a sentiment feedback is sent successfully", async function () {
      const apiInstance = lightSpeedManager.apiInstance;
      const request = {
        sentimentFeedback: {
          value: 5,
          feedback: "It's awesome!",
        },
      };
      const response = await apiInstance.feedbackRequest(request);
      assert.equal(
        response.message,
        "Thanks for your feedback!",
        JSON.stringify(response),
      );
    });

    it("Verify a sentiment feedback fails when permission is denied", async function () {
      const apiInstance = lightSpeedManager.apiInstance;
      const request = {
        sentimentFeedback: {
          value: 1,
          // If feedback starts with "permission_denied__", mock server returns an error.
          feedback: "permission_denied__user_with_no_seat",
        },
      };
      const response = await apiInstance.feedbackRequest(request);
      // When an error is found, feedbackRequest() does not return a message
      assert.equal(response.message, undefined, JSON.stringify(response));
    });

    it("Verify a sentiment feedback contains the model, if set", async function () {
      lightSpeedManager.settingsManager.settings.lightSpeedService.model =
        "testModel";
      const apiInstance = lightSpeedManager.apiInstance;
      const request = {
        sentimentFeedback: {
          value: 1,
          feedback: "Great stuff",
        },
        model: "",
      };
      const response = await apiInstance.feedbackRequest(request);
      assert.equal(request.model, "testModel", JSON.stringify(response));
    });
  });

  describe("Test Completion API", function () {
    it("Verify a completion request competes successfully.", async function () {
      const apiInstance = lightSpeedManager.apiInstance;

      const request = {
        prompt: "-task:",
        suggestionId: "df65f5f1-5c27-4dd4-8c58-3336b534321f",
        model: "cO986296-ef64-dr9s-bbf4-a2fd1645jhF5",
      };

      const response = await apiInstance.completionRequest(request);

      assert.equal(
        response.suggestionId,
        "df65f5f1-5c27-4dd4-8c58-3336b534321f",
        "SuggestionId assertion successful",
      );

      assert.equal(cancelSuggestionFeedbackSpy.called, true);
      assert.equal(inlineSuggestionHideHandlerSpy.called, false);
    });

    it("Verify a completion request expecting HTTP 204.", async function () {
      const apiInstance = lightSpeedManager.apiInstance;

      const request = {
        prompt: "-task: status=204",
        suggestionId: "df65f5f1-5c27-4dd4-8c58-3336b534321f",
        model: "model1",
      };

      const response = await apiInstance.completionRequest(request);

      assert.equal(
        response.suggestionId,
        undefined,
        "SuggestionId assertion successful",
      );

      assert.equal(cancelSuggestionFeedbackSpy.called, true);
      assert.equal(inlineSuggestionHideHandlerSpy.called, false);
    });

    it("Verify a completion request is ignored, feedback must be sent.", async function () {
      const apiInstance = lightSpeedManager.apiInstance;

      const request = {
        prompt: "-task:",
        suggestionId: "df65f5f1-5c27-4dd4-8c58-3336b534321f",
        model: "model1",
      };

      cancelSuggestionFeedbackSpy.returns(false);
      const response = await apiInstance.completionRequest(request);

      assert.equal(
        response.suggestionId,
        "df65f5f1-5c27-4dd4-8c58-3336b534321f",
        "SuggestionId assertion successful",
      );

      assert.equal(cancelSuggestionFeedbackSpy.called, true);
      assert.equal(inlineSuggestionHideHandlerSpy.called, true);
    });
  });

  afterEach(async function () {
    inlineSuggestionHideHandlerSpy.resetHistory();
  });

  after(async function () {
    isAuthenticated.restore();
    cancelSuggestionFeedbackSpy.restore();
    inlineSuggestionHideHandlerSpy.restore();
  });
}

function testFindTasks(): void {
  describe("Test findTasks for playbook explanation", () => {
    it("No tasks are found", () => {
      const PLAYBOOK = `---
- name: Playbook 1
  hosts: all
  roles:
    - my_role`;
      const rc = findTasks(PLAYBOOK);
      assert.equal(rc, false);
    });

    it("Tasks are found (tasks)", () => {
      const PLAYBOOK = `---
- name: Playbook 2
  hosts: all
  tasks:
    - name: Task 2-1
      ping:`;
      const rc = findTasks(PLAYBOOK);
      assert.equal(rc, true);
    });

    it("Tasks are found (pre_tasks)", () => {
      const PLAYBOOK = `---
- name: Playbook 3
  hosts: all
  pre_tasks:
    - name: Task 3-1
      ping:`;
      const rc = findTasks(PLAYBOOK);
      assert.equal(rc, true);
    });

    it("Tasks are found (post_tasks)", () => {
      const PLAYBOOK = `---
- name: Playbook 4
  hosts: all
  post_tasks:
    - name: Task 4-1
      ping:`;
      const rc = findTasks(PLAYBOOK);
      assert.equal(rc, true);
    });

    it("Tasks are found (handlers)", () => {
      const PLAYBOOK = `---
- name: Playbook 5
  hosts: all
  handlers:
    - name: Handler 5-1
      ping:`;
      const rc = findTasks(PLAYBOOK);
      assert.equal(rc, true);
    });

    it("Tasks are not found (invalid YAML)", () => {
      const PLAYBOOK = `---
- name: Playbook 6
  hosts: all
tasks:
    - name: Task 6-1
      ping:`;
      const rc = findTasks(PLAYBOOK);
      assert.equal(rc, false);
    });
  });
}

function testIsPlaybook(): void {
  describe("Test isPlaybook for playbook explanation", () => {
    it("A playbook", () => {
      const PLAYBOOK = `---
- name: Playbook 1
  hosts: all
  tasks:
    - name: Debug
      ansible.builtin.debug:
        msg: Hello`;
      const rc = isPlaybook(PLAYBOOK);
      assert.equal(rc, true);
    });

    it("Not a playbook", () => {
      const PLAYBOOK = `---
- name: Playbook 1
  tasks:
    - name: Debug
      ansible.builtin.debug:
        msg: Hello`;
      const rc = isPlaybook(PLAYBOOK);
      assert.equal(rc, false);
    });
  });
}

export function testLightspeedFunctions(): void {
  testGetLoggedInUserDetails();
  testGetLightSpeedStatusBarText();
  testFeedbackCompletionAPI();
  testFindTasks();
  testIsPlaybook();
}
