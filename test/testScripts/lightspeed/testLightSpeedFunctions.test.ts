// Function-level tests for Lightspeed
import sinon from "sinon";
import { getLoggedInSessionDetails } from "../../../src/features/lightspeed/utils/webUtils";
import { LightspeedAuthSession } from "../../../src/interfaces/lightspeed";
import { lightSpeedManager } from "../../../src/extension";
import { v4 as uuid } from "uuid";
import { assert } from "chai";
import { LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT } from "../../../src/definitions/lightspeed";

function getLightSpeedAuthSession(
  rhUserHasSeat: boolean,
  rhOrgHasSubscription: boolean,
  rhUserIsOrgAdmin: boolean,
): LightspeedAuthSession {
  const identifier = uuid();
  const session: LightspeedAuthSession = {
    id: identifier,
    accessToken: "dummy",
    account: {
      label: "label",
      id: identifier,
    },
    scopes: [],
    rhUserHasSeat,
    rhOrgHasSubscription,
    rhUserIsOrgAdmin,
  };
  return session;
}

function testGetLoggedInSessionDetails(): void {
  describe("Test getLoggedInSessionDetails", function () {
    it(`Verify a seated user`, function () {
      const session = getLightSpeedAuthSession(true, true, false);
      const { userInfo } = getLoggedInSessionDetails(session);
      assert.equal(userInfo?.userType, "Licensed");
      assert.isTrue(userInfo?.subscribed);
      assert.isUndefined(userInfo?.role);
    });

    it(`Verify an unseated user`, function () {
      const session = getLightSpeedAuthSession(false, true, false);
      const { userInfo } = getLoggedInSessionDetails(session);
      assert.equal(userInfo?.userType, "Unlicensed");
      assert.isTrue(userInfo?.subscribed);
      assert.isUndefined(userInfo?.role);
    });

    it(`Verify an unseated user of an unsubscribed org`, function () {
      const session = getLightSpeedAuthSession(false, false, false);
      const { userInfo } = getLoggedInSessionDetails(session);
      assert.equal(userInfo?.userType, "Unlicensed");
      assert.isNotTrue(userInfo?.subscribed);
      assert.isUndefined(userInfo?.role);
    });

    it(`Verify a seated administrator`, function () {
      const session = getLightSpeedAuthSession(true, true, true);
      const { userInfo } = getLoggedInSessionDetails(session);
      assert.equal(userInfo?.userType, "Licensed");
      assert.isTrue(userInfo?.subscribed);
      assert.equal(userInfo?.role, "Administrator");
    });
  });
}

function testGetLightSpeedStatusBarText(): void {
  describe("Test getLightSpeedStatusBarTest", function () {
    it("Verify status bar text for various user types", async function () {
      const statusBarProvider = lightSpeedManager.statusBarProvider;

      let text = await statusBarProvider.getLightSpeedStatusBarText();
      assert.equal(text, LIGHTSPEED_STATUS_BAR_TEXT_DEFAULT);

      text = await statusBarProvider.getLightSpeedStatusBarText(true, true);
      assert.equal(text, "Lightspeed (licensed)");
      text = await statusBarProvider.getLightSpeedStatusBarText(true, false);
      assert.equal(text, "Lightspeed (unlicensed)");
      text = await statusBarProvider.getLightSpeedStatusBarText(false, true);
      assert.equal(text, "Lightspeed (unlicensed)");
      text = await statusBarProvider.getLightSpeedStatusBarText(false, false);
      assert.equal(text, "Lightspeed (unlicensed)");
    });
  });
}

function testFeedbackAPI(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let isAuthenticated: any;

  before(async function () {
    isAuthenticated = sinon.stub(
      lightSpeedManager.lightSpeedAuthenticationProvider,
      "isAuthenticated",
    );
    isAuthenticated.returns(Promise.resolve(true));
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

  after(async function () {
    sinon.restore();
  });
}

export function testLightspeedFunctions(): void {
  testGetLoggedInSessionDetails();
  testGetLightSpeedStatusBarText();
  testFeedbackAPI();
}
