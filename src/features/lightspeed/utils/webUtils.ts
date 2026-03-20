import { EventEmitter, Uri, UriHandler } from "vscode";
import crypto from "crypto";
import { SettingsManager } from "@src/settings";
import {
  LightspeedSessionModelInfo,
  LightspeedSessionUserInfo,
  LightspeedUserDetails,
  LightspeedSessionInfo,
} from "@src/interfaces/lightspeed";
import {
  LIGHTSPEED_USER_TYPE,
  WCA_API_ENDPOINT_DEFAULT,
} from "@src/definitions/lightspeed";
import { lightSpeedManager } from "@src/extension";

// Also defined in package.json in "".contributes.authentication"
export const ANSIBLE_LIGHTSPEED_AUTH_ID = "auth-lightspeed";
export const ANSIBLE_LIGHTSPEED_AUTH_NAME = "Ansible Lightspeed";

export const RHSSO_AUTH_ID = "redhat-account-auth";
export const SESSIONS_SECRET_KEY = `${ANSIBLE_LIGHTSPEED_AUTH_ID}.sessions`;
export const ACCOUNT_SECRET_KEY = `${ANSIBLE_LIGHTSPEED_AUTH_NAME}.account`;

export interface OAuthAccount {
  type: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAtTimestampInSeconds: number;
}

export class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
  public handleUri(uri: Uri) {
    this.fire(uri);
  }
}

/** Generates a random alphanumeric string between 50 and 60 characters long */
export const generateCodeVerifier = (): string => {
  const secret = crypto.randomBytes(44).toString("base64");
  const alphanumericSecret = secret.replace(/[^a-zA-Z0-9]/g, "");
  return alphanumericSecret.length >= 50
    ? alphanumericSecret
    : generateCodeVerifier();
};

// A function to return the expiry date and time in epoch
export function calculateTokenExpiryTime(expiresIn: number) {
  const now = Math.floor(new Date().getTime() / 1000);
  return now + expiresIn;
}

/* Get base uri in a correct formatted way */
export function getBaseUri(
  settingsManager: SettingsManager,
  providerOverride?: string,
): string {
  // Check the provider from globalState via lightSpeedManager if available
  const provider =
    providerOverride ||
    lightSpeedManager?.llmProviderSettings?.getProvider() ||
    settingsManager.settings.lightSpeedService.provider;

  const baseUri = settingsManager.settings.lightSpeedService.apiEndpoint.trim();

  // For WCA: use custom endpoint if configured, otherwise use default
  if (provider === "wca") {
    // If a custom endpoint is configured and differs from default, use it
    // This allows connecting to stage, test, or on-premise Lightspeed instances
    if (baseUri && baseUri !== WCA_API_ENDPOINT_DEFAULT) {
      return baseUri.endsWith("/") ? baseUri.slice(0, -1) : baseUri;
    }
    // Otherwise use the default production WCA endpoint
    return WCA_API_ENDPOINT_DEFAULT;
  }

  return baseUri.endsWith("/") ? baseUri.slice(0, -1) : baseUri;
}

export function getUserTypeLabel(
  rhOrgHasSubscription?: boolean,
): LIGHTSPEED_USER_TYPE {
  if (rhOrgHasSubscription === undefined) {
    return "Not logged in";
  }
  return rhOrgHasSubscription ? "Licensed" : "Unlicensed";
}

export function getLoggedInUserDetails(
  sessionData?: LightspeedUserDetails,
): LightspeedSessionInfo {
  const userInfo: LightspeedSessionUserInfo = {};
  const modelInfo: LightspeedSessionModelInfo = {};
  userInfo.userType = getUserTypeLabel(sessionData?.rhOrgHasSubscription);
  if (sessionData?.rhUserIsOrgAdmin) {
    userInfo.role = "Administrator";
  }
  if (sessionData?.rhOrgHasSubscription) {
    userInfo.subscribed = true;
  }
  if (lightSpeedManager.currentModelValue) {
    modelInfo.model = lightSpeedManager.currentModelValue;
  }
  return {
    userInfo: userInfo,
    modelInfo: modelInfo,
  };
}
