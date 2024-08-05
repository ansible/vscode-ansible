import * as vscode from "vscode";
import {
  RHSSO_AUTH_ID,
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  getBaseUri,
  getUserTypeLabel,
  getLoggedInUserDetails,
} from "./utils/webUtils";
import {
  LIGHTSPEED_MARKDOWN_ME_AUTH_URL,
  LIGHTSPEED_ME_AUTH_URL,
  LightSpeedCommands,
} from "../../definitions/lightspeed";
import { SettingsManager } from "../../settings";
import axios from "axios";
import { LightspeedUserDetails } from "../../interfaces/lightspeed";
import {
  LightSpeedAuthenticationProvider,
  isSupportedCallback,
} from "./lightSpeedOAuthProvider";
import { Log } from "../../utils/logger";
import * as marked from "marked";

export class LightspeedAccessDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LightspeedAccessDenied";
  }
}

export enum AuthProviderType {
  rhsso = RHSSO_AUTH_ID,
  lightspeed = ANSIBLE_LIGHTSPEED_AUTH_ID,
}

export const ExtensionHost = {
  WebWorker: "WebWorker",
  Remote: "Remote",
  Local: "Local",
} as const;
type ExtensionHostType = (typeof ExtensionHost)[keyof typeof ExtensionHost];

export interface LoggedInUserInfo {
  username?: string;
  external_username: string;
  rh_user_has_seat: boolean;
  rh_org_has_subscription: boolean;
  rh_user_is_org_admin: boolean;
  org_telemetry_opt_out: boolean;
}

export class LightspeedUser {
  public _settingsManager: SettingsManager;
  private _lightspeedAuthenticationProvider: LightSpeedAuthenticationProvider;
  private _userType: AuthProviderType | undefined;
  private _session: vscode.AuthenticationSession | undefined;
  private _userDetails: LightspeedUserDetails | undefined;
  private _logger: Log;
  private _extensionHost: ExtensionHostType;
  private _markdownUserDetails: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    settingsManager: SettingsManager,
    lightspeedAuthenticationProvider: LightSpeedAuthenticationProvider,
    logger: Log,
  ) {
    this._settingsManager = settingsManager;
    this._lightspeedAuthenticationProvider = lightspeedAuthenticationProvider;
    this._logger = logger;
    this._extensionHost =
      typeof navigator === "undefined"
        ? context.extension.extensionKind === vscode.ExtensionKind.UI
          ? ExtensionHost.Local
          : ExtensionHost.Remote
        : ExtensionHost.WebWorker;
    this.logAuthProviderDebugHints();
  }

  private logAuthProviderDebugHints() {
    const lightspeedUri = getBaseUri(this._settingsManager);
    this._logger.info(
      `[ansible-lightspeed-user] Initializing LightspeedUser for Lightspeed URI ${lightspeedUri} and extension host ${this._extensionHost}`,
    );
    this._logger.info(
      `[ansible-lightspeed-user] Red Hat authentication extension is${vscode.extensions.getExtension("redhat.vscode-redhat-account") ? "" : " not"} installed.`,
    );
  }

  public static isLightspeedUserAuthProviderType(providerId: string) {
    return Object.values(AuthProviderType).some(
      (providerType) => providerType === providerId,
    );
  }

  private getScopesForAuthProviderType(authProviderType: AuthProviderType) {
    switch (authProviderType) {
      case AuthProviderType.rhsso: {
        return ["api.lightspeed"];
      }
      default:
        return [];
    }
  }
  /* Get the user info from server */
  public async getUserInfo(token: string) {
    this._logger.info(
      "[ansible-lightspeed-user] Sending request for logged-in user info...",
    );

    try {
      const { data } = await axios.get(
        `${getBaseUri(this._settingsManager)}${LIGHTSPEED_ME_AUTH_URL}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      return data;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status === 401
      ) {
        throw new LightspeedAccessDenied(error.message);
      } else if (axios.isAxiosError(error)) {
        this._logger.error(
          `[ansible-lightspeed-user] error message: ${error.message}`,
        );
        console.error(
          "[ansible-lightspeed-user] error response data: ",
          error.response?.data,
        );
        throw new Error(error.message);
      } else {
        this._logger.error(
          `[ansible-lightspeed-user] unexpected error: ${error}`,
        );
        throw new Error("An unexpected error occurred");
      }
    }
  }

  public async getUserInfoFromMarkdown(token: string) {
    this._logger.info(
      "[ansible-lightspeed-user] Sending request for logged-in user info...",
    );

    try {
      const { data } = await axios.get(
        `${getBaseUri(this._settingsManager)}${LIGHTSPEED_MARKDOWN_ME_AUTH_URL}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const markdownData = marked.parseInline(data.content) as string;

      return markdownData;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status === 401
      ) {
        throw new LightspeedAccessDenied(error.message);
      } else if (axios.isAxiosError(error)) {
        this._logger.error(
          `[ansible-lightspeed-user] error message: ${error.message}`,
        );
        /* istanbul ignore next */
        console.error(
          "[ansible-lightspeed-user] error response data: ",
          error.response?.data,
        );
        throw new Error(error.message);
      } else {
        this._logger.error(
          `[ansible-lightspeed-user] unexpected error: ${error}`,
        );
        throw new Error("An unexpected error occurred");
      }
    }
  }

  public async getAuthProviderOrder() {
    // NOTE: We can't gate this check on if this extension is active,
    // because it only activates on an authentication request.
    if (!vscode.extensions.getExtension("redhat.vscode-redhat-account")) {
      return [AuthProviderType.lightspeed];
    }
    const preferRHSSO = process.env.LIGHTSPEED_PREFER_RHSSO_AUTH
      ? process.env.LIGHTSPEED_PREFER_RHSSO_AUTH.toLowerCase() === "true"
      : false;
    if (preferRHSSO) {
      this._logger.info(
        "[ansible-lightspeed-user] Try Red Hat authentication first per LIGHTSPEED_PREFER_RHSSO_AUTH.",
      );
      return [AuthProviderType.rhsso, AuthProviderType.lightspeed];
    }
    // Prefer the auth provider that has already worked
    if (this._userType) {
      this._logger.info(
        `[ansible-lightspeed-user] Trying previous auth provider first: ${this._userType}`,
      );
      if (this._userType === AuthProviderType.lightspeed) {
        return [AuthProviderType.lightspeed, AuthProviderType.rhsso];
      } else {
        return [AuthProviderType.rhsso, AuthProviderType.lightspeed];
      }
    }
    const lightspeedUri = getBaseUri(this._settingsManager);
    // Prefer RHSSO when we know Lightspeed auth will be broken.
    // Prefer Lightspeed auth all other times.
    if (
      lightspeedUri === "https://c.ai.ansible.redhat.com" &&
      this._extensionHost === ExtensionHost.Remote
    ) {
      const redirectUri =
        await LightSpeedAuthenticationProvider.getExternalRedirectUri(
          this.context,
        );
      const isSupportedClient = isSupportedCallback(redirectUri);
      this._logger.info(
        `[ansible-lightspeed-user] Redirect URI ${redirectUri} is${isSupportedClient ? "" : " not"} supported by Lightspeed auth provider.`,
      );
      if (!isSupportedClient) {
        return [AuthProviderType.rhsso, AuthProviderType.lightspeed];
      }
    }
    return [AuthProviderType.lightspeed, AuthProviderType.rhsso];
  }

  private async setLightspeedUser(
    createIfNone: boolean,
    useProviderType: AuthProviderType | undefined = undefined,
  ) {
    let session = undefined;
    // If user specified the provider type to sign in with, use only that provider type
    if (useProviderType) {
      session = await vscode.authentication.getSession(
        useProviderType,
        this.getScopesForAuthProviderType(useProviderType),
        { createIfNone },
      );
      if (session) {
        this._userType = useProviderType;
      }
    } else {
      const authProviders = await this.getAuthProviderOrder();

      // Try to get the session silently first to avoid adding a bunch of "sign in" menu options
      for (const authProvider of authProviders) {
        session = await vscode.authentication.getSession(
          authProvider,
          this.getScopesForAuthProviderType(authProvider),
          { silent: true },
        );
        if (session) {
          this._userType = authProvider;
          break;
        }
      }
      // If no session found, try the preferred auth provider with the supplied createIfNone, either forcing the login or adding the badge
      if (!session) {
        session = await vscode.authentication.getSession(
          authProviders[0],
          this.getScopesForAuthProviderType(authProviders[0]),
          { createIfNone },
        );
        if (session) {
          this._userType = authProviders[0];
        }
      }
    }

    if (session) {
      if (await this._updateUserInformation(createIfNone, session)) {
        return;
      }
    }

    this._session = undefined;
    this._userDetails = undefined;
    this._markdownUserDetails = undefined;
    this._userType = undefined;
  }

  public async updateUserInformation(): Promise<void> {
    if (this._session) {
      await this._updateUserInformation(false, this._session);
    }
  }

  private async _updateUserInformation(
    createIfNone: boolean,
    session: vscode.AuthenticationSession,
  ): Promise<boolean> {
    try {
      const userinfo: LoggedInUserInfo = await this.getUserInfo(
        session.accessToken,
      );
      this._session = session;

      let markdownUserInfo: string = "";
      try {
        markdownUserInfo = await this.getUserInfoFromMarkdown(
          session.accessToken,
        );
      } catch (error) {
        markdownUserInfo = "";
      }
      this._markdownUserDetails = markdownUserInfo;

      const displayName = userinfo.external_username || userinfo.username || "";
      const userTypeLabel = getUserTypeLabel(
        userinfo.rh_org_has_subscription,
        userinfo.rh_user_has_seat,
      ).toLowerCase();

      this._userDetails = {
        rhUserHasSeat: userinfo.rh_user_has_seat,
        rhOrgHasSubscription: userinfo.rh_org_has_subscription,
        rhUserIsOrgAdmin: userinfo.rh_user_is_org_admin,
        displayName,
        displayNameWithUserType: `${displayName} (${userTypeLabel})`,
        orgOptOutTelemetry: userinfo.org_telemetry_opt_out,
      };
      return true;
    } catch (error) {
      this._logger.info(
        `[ansible-lightspeed-user] Request for logged-in user info failed: ${error}`,
      );
      if (error instanceof LightspeedAccessDenied) {
        // Auth provider has a dead session stored. We need to force it out.
        if (createIfNone && this._userType) {
          vscode.authentication.getSession(
            this._userType,
            this.getScopesForAuthProviderType(this._userType),
            { forceNewSession: true },
          );
        } else if (this._userType === AuthProviderType.lightspeed) {
          this._lightspeedAuthenticationProvider.removeSession(session.id);
        }
      }
    }
    return false;
  }

  public async refreshLightspeedUser() {
    this._session = undefined;
    this._userDetails = undefined;
    this._markdownUserDetails = undefined;
    await this.setLightspeedUser(false);
  }

  public async getLightspeedUserDetails(
    createIfNone: boolean,
    useProviderType: AuthProviderType | undefined = undefined,
  ) {
    // Ensure we don't try to get a lightspeed auth session when the provider is not initialized
    if (!this._settingsManager.settings.lightSpeedService.enabled) {
      return undefined;
    }
    if (
      this._userDetails &&
      (!useProviderType || useProviderType === this._userType)
    ) {
      return this._userDetails;
    }

    await this.setLightspeedUser(createIfNone, useProviderType);

    return this._userDetails;
  }

  public async getMarkdownLightspeedUserDetails(
    createIfNone: boolean,
    useProviderType: AuthProviderType | undefined = undefined,
  ) {
    // Ensure we don't try to get a lightspeed auth session when the provider is not initialized
    if (!this._settingsManager.settings.lightSpeedService.enabled) {
      return undefined;
    }
    if (
      this._markdownUserDetails &&
      (!useProviderType || useProviderType === this._userType)
    ) {
      return this._markdownUserDetails;
    }

    await this.setLightspeedUser(createIfNone, useProviderType);

    return this._markdownUserDetails;
  }

  public async getLightspeedUserContent() {
    // Ensure we don't try to get a lightspeed auth session when the provider is not initialized
    if (!this._settingsManager.settings.lightSpeedService.enabled) {
      return undefined;
    }

    const markdownUserDetails =
      await this.getMarkdownLightspeedUserDetails(false);
    const userDetails = await this.getLightspeedUserDetails(false);

    let content;
    if (markdownUserDetails) {
      content = String(markdownUserDetails);
    } else {
      if (userDetails) {
        const sessionInfo = getLoggedInUserDetails(userDetails);
        const userName = userDetails.displayNameWithUserType;
        const userType = sessionInfo.userInfo?.userType || "";
        const userRole =
          sessionInfo.userInfo?.role !== undefined
            ? sessionInfo.userInfo?.role
            : "";
        content = `
          <p>Logged in as: ${userName}</p>
          <p>User Type: ${userType}</p>
          ${userRole ? "Role: " + userRole : ""}
        `;
      }
    }

    return content;
  }

  public async rhUserHasSeat(): Promise<boolean | undefined> {
    const userDetails = await this.getLightspeedUserDetails(false);

    if (userDetails === undefined) {
      this._logger.info(
        "[ansible-lightspeed-user] User authentication session not found for seat check.",
      );
      return undefined;
    } else if (userDetails?.rhUserHasSeat) {
      this._logger.info(
        `[ansible-lightspeed-user] User "${userDetails?.displayNameWithUserType}" has a seat.`,
      );
      return true;
    } else {
      this._logger.info(
        `[ansible-lightspeed-user] User "${userDetails?.displayNameWithUserType}" does not have a seat.`,
      );
      return false;
    }
  }

  public async rhOrgHasSubscription(): Promise<boolean | undefined> {
    const userDetails = await this.getLightspeedUserDetails(false);
    if (userDetails === undefined) {
      this._logger.info(
        "[ansible-lightspeed-user] User authentication session not found for subscription check.",
      );
      return undefined;
    } else if (userDetails?.rhOrgHasSubscription) {
      this._logger.info(
        `[ansible-lightspeed-user] User "${userDetails?.displayNameWithUserType}" has an Org with a subscription.`,
      );
      return true;
    } else {
      this._logger.info(
        `[ansible-lightspeed-user] User "${userDetails?.displayNameWithUserType}" does not have an Org with a subscription.`,
      );
      return false;
    }
  }

  public async orgOptOutTelemetry(): Promise<boolean | undefined> {
    const userDetails = await this.getLightspeedUserDetails(false);
    return userDetails?.orgOptOutTelemetry;
  }

  public async getLightspeedUserAccessToken() {
    this._logger.info("[ansible-lightspeed-user] Getting access token...");

    if (process.env.TEST_LIGHTSPEED_ACCESS_TOKEN) {
      this._logger.info("[ansible-lightspeed-user] Test access token returned");
      return process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
    }

    if (!this._session) {
      this._logger.info(
        "[ansible-lightspeed-user] Session not found. Returning...",
      );
      const selection = await vscode.window.showWarningMessage(
        "You must be logged in to use Ansible Lightspeed.\n",
        "Login",
      );
      if (selection === "Login") {
        vscode.commands.executeCommand(
          LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
        );
      }
      return;
    }

    this._logger.info(
      `[ansible-lightspeed-user] Session found for auth provider "${this._userType}" with scopes "${this._session.scopes}"`,
    );

    if (this._userType === AuthProviderType.lightspeed) {
      return this._lightspeedAuthenticationProvider.refreshAccessToken(
        this._session,
      );
    }
    return this._session.accessToken;
  }

  public async isAuthenticated() {
    if (this._session) {
      return true;
    }
    return false;
  }
}
