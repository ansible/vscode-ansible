import { EventEmitter, Uri, UriHandler } from 'vscode';
import crypto from 'crypto';
import type { LightspeedUserDetails, LightspeedSessionInfo, LightspeedSessionUserInfo, LightspeedSessionModelInfo } from '../interfaces';

export const ANSIBLE_LIGHTSPEED_AUTH_ID = 'auth-lightspeed';
export const ANSIBLE_LIGHTSPEED_AUTH_NAME = 'Ansible Lightspeed';

export const SESSIONS_SECRET_KEY = `${ANSIBLE_LIGHTSPEED_AUTH_ID}.sessions`;
export const ACCOUNT_SECRET_KEY = `${ANSIBLE_LIGHTSPEED_AUTH_NAME}.account`;

export interface OAuthAccount {
    type: 'oauth';
    accessToken: string;
    refreshToken: string;
    expiresAtTimestampInSeconds: number;
}

export class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
    public handleUri(uri: Uri) {
        this.fire(uri);
    }
}

export const generateCodeVerifier = (): string => {
    const secret = crypto.randomBytes(44).toString('base64');
    const alphanumericSecret = secret.replace(/[^a-zA-Z0-9]/g, '');
    return alphanumericSecret.length >= 50 ? alphanumericSecret : generateCodeVerifier();
};

const DEFAULT_TOKEN_EXPIRES_IN_SECONDS = 3600;

export function coerceExpiresIn(
    expiresIn: unknown,
    defaultSeconds = DEFAULT_TOKEN_EXPIRES_IN_SECONDS,
): number {
    const num = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn);
    return Number.isFinite(num) && num > 0 ? num : defaultSeconds;
}

export function calculateTokenExpiryTime(expiresIn: number) {
    const now = Math.floor(new Date().getTime() / 1000);
    return now + expiresIn;
}

export type LIGHTSPEED_USER_TYPE = 'Licensed' | 'Unlicensed' | 'Not logged in';

export function getUserTypeLabel(rhOrgHasSubscription?: boolean): LIGHTSPEED_USER_TYPE {
    if (rhOrgHasSubscription === undefined) {
        return 'Not logged in';
    }
    return rhOrgHasSubscription ? 'Licensed' : 'Unlicensed';
}

export function getLoggedInUserDetails(sessionData?: LightspeedUserDetails): LightspeedSessionInfo {
    const userInfo: LightspeedSessionUserInfo = {};
    const modelInfo: LightspeedSessionModelInfo = {};
    userInfo.userType = getUserTypeLabel(sessionData?.rhOrgHasSubscription);
    if (sessionData?.rhUserIsOrgAdmin) {
        userInfo.role = 'Administrator';
    }
    if (sessionData?.rhOrgHasSubscription) {
        userInfo.subscribed = true;
    }
    return {
        userInfo,
        modelInfo,
    };
}

export function getBaseUri(apiEndpoint: string): string {
    const trimmed = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
    return trimmed;
}

const VALID_DESKTOP_CALLBACK_SCHEMES = ['vscode', 'vscodium', 'vscode-insiders', 'checode', 'cursor'];

export function isSupportedCallback(uri: Uri) {
    return (
        VALID_DESKTOP_CALLBACK_SCHEMES.includes(uri.scheme) ||
        /\.openshiftapps\.com$/.test(uri.authority) ||
        /\.github\.dev$/.test(uri.authority)
    );
}
