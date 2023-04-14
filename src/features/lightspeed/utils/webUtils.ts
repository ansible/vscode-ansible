import { EventEmitter, Uri, UriHandler } from "vscode";
import crypto from "crypto";
import { SettingsManager } from "../../../settings";

export const ANSIBLE_LIGHTSPEED_AUTH_ID = `auth-lightspeed`;
export const ANSIBLE_LIGHTSPEED_AUTH_NAME = `Ansible Lightspeed`;
export const SESSIONS_SECRET_KEY = `${ANSIBLE_LIGHTSPEED_AUTH_ID}.sessions`;
export const ACCOUNT_SECRET_KEY = `${ANSIBLE_LIGHTSPEED_AUTH_NAME}.account`;

export interface OAuthAccount {
  type: "oauth";
  accessToken: string;
  refreshToken: string;
  expiresAtTimestampInSeconds: number;
}

export interface LoggedInUserInfo {
  username: string;
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

/** Generates challenge code using the code verifier */
export const generateCodeChallengeFromVerifier = (v: string) => {
  const sha256 = (plain: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.createHash("sha256").update(data);
  };
  return sha256(v)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

// A function to return the expiry date and time in epoch
export function calculateTokenExpiryTime(expiresIn: number) {
  const now = Math.floor(new Date().getTime() / 1000);
  return now + expiresIn;
}

/* Get base uri in a correct formatted way */
export function getBaseUri(settingsManager: SettingsManager) {
  const baseUri = settingsManager.settings.lightSpeedService.basePath.trim();
  return baseUri.endsWith("/") ? baseUri.slice(0, -1) : baseUri;
}
