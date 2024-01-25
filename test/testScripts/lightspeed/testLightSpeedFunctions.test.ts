import { getLoggedInSessionDetails } from "../../../src/features/lightspeed/utils/webUtils";
import { LightspeedAuthSession } from "../../../src/interfaces/lightspeed";
import { lightSpeedManager } from "../../../src/extension";
import { v4 as uuid } from "uuid";
import { assert } from "chai";

function getLightSpeedAuthSession(
  rhUserHasSeat: boolean,
  rhOrgHasSubscription: boolean,
  rhUserIsOrgAdmin: boolean
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
      let text = await statusBarProvider.getLightSpeedStatusBarText(true, true);
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

export function testLightspeedFunctions(): void {
  testGetLoggedInSessionDetails();
  testGetLightSpeedStatusBarText();
}
