// Unit tests for LightspeedUser

import { assert } from "chai";
import {
  LightspeedUser,
  LoggedInUserInfo,
  AuthProviderType,
} from "../../../src/features/lightspeed/lightspeedUser";
import { isSupportedCallback } from "../../../src/features/lightspeed/lightSpeedOAuthProvider";
import * as vscode from "vscode";
import sinon from "sinon";
import { lightSpeedManager } from "../../../src/extension";

function testIsSupportedCallback() {
  describe("Test lightSpeedOAuthProvider.isSupportedCallback", function () {
    it("Returns true for vscode://redhat.ansible", function () {
      assert.isTrue(
        isSupportedCallback(vscode.Uri.parse("vscode://redhat.ansible")),
      );
    });
    it("Returns true for https://*.openshiftapps.com", function () {
      assert.isTrue(
        isSupportedCallback(vscode.Uri.parse("https://foo.openshiftapps.com")),
      );
    });
    it("Returns false for https://my.devspaces.acme.com", function () {
      assert.isFalse(
        isSupportedCallback(vscode.Uri.parse("https://my.devspaces.acme.com")),
      );
    });
  });
}

function testIsLightspeedUserAuthProviderType() {
  describe("Test LightspeedUser.isLightspeedUserAuthProviderType", function () {
    it("Returns true for auth-lightspeed", function () {
      assert.isTrue(
        LightspeedUser.isLightspeedUserAuthProviderType("auth-lightspeed"),
      );
    });

    it("Returns true for redhat-account-auth", function () {
      assert.isTrue(
        LightspeedUser.isLightspeedUserAuthProviderType("redhat-account-auth"),
      );
    });

    it("Returns false for github", function () {
      assert.isFalse(LightspeedUser.isLightspeedUserAuthProviderType("github"));
    });
  });
}

function testGetUserInfo() {
  describe("Test LightspeedUser.getUserInfo", function () {
    it("Returns /me endpoint results with valid access token", async function () {
      const accessToken =
        (await lightSpeedManager.lightspeedAuthenticatedUser.getLightspeedUserAccessToken()) as string;
      const userInfo: LoggedInUserInfo =
        await lightSpeedManager.lightspeedAuthenticatedUser.getUserInfo(
          accessToken,
        );

      assert.isNotNull(userInfo);
    });
  });
}

function testGetUserInfoFromMarkdown() {
  describe("Test LightspeedUser.getUserInfoFromMarkdown", function () {
    it("Returns /me/summary endpoint results with valid access token", async function () {
      const accessToken =
        (await lightSpeedManager.lightspeedAuthenticatedUser.getLightspeedUserAccessToken()) as string;
      const markdownUserInfo: string =
        await lightSpeedManager.lightspeedAuthenticatedUser.getUserInfoFromMarkdown(
          accessToken,
        );

      assert.isNotNull(markdownUserInfo);
    });
  });
}

function testGetMarkdownLightspeedUserDetails() {
  describe("test LightspeedUser.getMarkdownLightspeedUserDetails", function () {
    it("Returns formatted content from /me/summary endpoint", async function () {
      const markdownUserDetails =
        await lightSpeedManager.lightspeedAuthenticatedUser.getMarkdownLightspeedUserDetails(
          false,
        );

      assert.isNotNull(markdownUserDetails);
    });
  });
}

function testGetLightspeedUserContent() {
  describe("test LightspeedUser.getLightspeedUserContent", function () {
    it("Returns proper HTML markdown based on whether /me/summary is available", async function () {
      const content =
        await lightSpeedManager.lightspeedAuthenticatedUser.getLightspeedUserContent();
      assert.isNotNull(content);
    });
  });
}

function testGetAuthProviderOrder() {
  describe("Test LightspeedUser.getAuthProviderOrder", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rhAuthExtension: vscode.Extension<any> = {
      id: "redhat.vscode-redhat-account",
      extensionPath: "/path/to/rhsso/extension",
      extensionKind: vscode.ExtensionKind.Workspace,
      extensionUri: vscode.Uri.file("/"),
      packageJSON: undefined,
      isActive: true,
      activate(): Promise<void> {
        return new Promise(() => null);
      },
      exports: {},
    };
    let getExtensionStub: sinon.SinonStub;
    before(async function () {
      getExtensionStub = sinon.stub(vscode.extensions, "getExtension");
      getExtensionStub
        .withArgs("redhat.vscode-redhat-account")
        .returns(rhAuthExtension);
    });
    after(() => {
      getExtensionStub.restore();
    });

    it("Honors LIGHTSPEED_PREFER_RHSSO_AUTH env var", async function () {
      const originalEnv = { ...process.env };
      process.env.LIGHTSPEED_PREFER_RHSSO_AUTH = "true";
      const authProviderOrder =
        await lightSpeedManager.lightspeedAuthenticatedUser.getAuthProviderOrder();
      assert.equal(authProviderOrder.length, 2);
      assert.equal(authProviderOrder[0], AuthProviderType.rhsso);
      assert.equal(authProviderOrder[1], AuthProviderType.lightspeed);
      process.env = { ...originalEnv };
    });
    it("Prefers the auth type that has already worked previously", async function () {
      const getSessionStub = sinon.stub(vscode.authentication, "getSession");
      const mockSession: vscode.AuthenticationSession = {
        id: "mock",
        accessToken: "mock",
        account: { id: "mock-user", label: "mock-label" },
        scopes: ["api.lightspeed"],
      };
      getSessionStub.returns(Promise.resolve(mockSession));

      await lightSpeedManager.lightspeedAuthenticatedUser.getLightspeedUserDetails(
        true,
        AuthProviderType.rhsso,
      );
      const authProviderOrder =
        await lightSpeedManager.lightspeedAuthenticatedUser.getAuthProviderOrder();

      assert.equal(authProviderOrder.length, 2);
      assert.equal(authProviderOrder[0], AuthProviderType.rhsso);
      assert.equal(authProviderOrder[1], AuthProviderType.lightspeed);

      getSessionStub.restore();
    });
  });
}

function testRedHatSignInCommand() {
  describe("Test Red Hat Sign-In with Red Hat auth extension installed", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rhAuthExtension: vscode.Extension<any> = {
      id: "redhat.vscode-redhat-account",
      extensionPath: "/path/to/rhsso/extension",
      extensionKind: vscode.ExtensionKind.Workspace,
      extensionUri: vscode.Uri.file("/"),
      packageJSON: undefined,
      isActive: true,
      activate(): Promise<void> {
        return new Promise(() => null);
      },
      exports: {},
    };

    let showInformationMessageStub: sinon.SinonStub;
    let getLightspeedUserDetailsStub: sinon.SinonStub;
    let getExtensionStub: sinon.SinonStub;

    before(async function () {
      showInformationMessageStub = sinon.stub(
        vscode.window,
        "showInformationMessage",
      );
      getLightspeedUserDetailsStub = sinon.stub(
        lightSpeedManager.lightspeedAuthenticatedUser,
        "getLightspeedUserDetails",
      );
      getLightspeedUserDetailsStub.returns(
        Promise.resolve({
          rhUserHasSeat: true,
          rhOrgHasSubscription: true,
          rhUserIsOrgAdmin: true,
          displayName: "Joe Lightspeed",
          displayNameWithUserType: "Joe Lightspeed (licensed)",
          orgOptOutTelemetry: false,
        }),
      );
      getExtensionStub = sinon.stub(vscode.extensions, "getExtension");
      getExtensionStub
        .withArgs("redhat.vscode-redhat-account")
        .returns(rhAuthExtension);
    });
    after(() => {
      getLightspeedUserDetailsStub.restore();
      showInformationMessageStub.restore();
      getExtensionStub.restore();
    });
    it("Logs in with Red Hat when Red Hat Auth extension is installed", async () => {
      // Trigger Sign in with Red Hat
      await vscode.commands.executeCommand(
        "ansible.lightspeed.signInWithRedHat",
      );

      // await new Promise((res) => {
      //   setTimeout(res, 1000);
      // });

      // Assert that showInformationMessageStub was called with the expected message
      assert.isTrue(showInformationMessageStub.calledOnce);
      assert.equal(
        showInformationMessageStub.firstCall.args[0],
        "Welcome back Joe Lightspeed (licensed)",
      );
    });
  });
  describe("Test Red Hat Sign-In with Red Hat auth extension not installed", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let showErrorMessageStub: any;
    let getExtensionStub: sinon.SinonStub;

    before(async function () {
      showErrorMessageStub = sinon.stub(vscode.window, "showErrorMessage");
      getExtensionStub = sinon.stub(vscode.extensions, "getExtension");
      getExtensionStub
        .withArgs("redhat.vscode-redhat-account")
        .returns(undefined);
    });
    after(() => {
      showErrorMessageStub.restore();
      getExtensionStub.restore();
    });
    it("Displays an error when signing in with Red Hat without Red Hat Auth extension", async () => {
      // Trigger Sign in with Red Hat
      await vscode.commands.executeCommand(
        "ansible.lightspeed.signInWithRedHat",
      );

      // await new Promise((res) => {
      //   setTimeout(res, 1000);
      // });

      assert.isTrue(showErrorMessageStub.calledOnce);
      assert.equal(
        showErrorMessageStub.firstCall.args[0],
        "You must install the Red Hat Authentication extension to sign in with Red Hat.",
      );
    });
  });
}

export function testLightspeedUser(): void {
  testIsSupportedCallback();
  testIsLightspeedUserAuthProviderType();
  testGetUserInfo();
  testGetUserInfoFromMarkdown();
  testGetMarkdownLightspeedUserDetails();
  testGetLightspeedUserContent();
  testGetAuthProviderOrder();
  testRedHatSignInCommand();
}
