import { EventEmitter, Uri, UriHandler } from 'vscode';
import crypto from 'crypto';
import type {
    LightspeedUserDetails,
    LightspeedSessionInfo,
    LightspeedSessionUserInfo,
    LightspeedSessionModelInfo,
} from '../interfaces';

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

/**
 * Handles OAuth callback URIs from the authentication flow.
 */
export class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
    /**
     * Fires the URI event when an authentication callback is received.
     * @param uri - The callback URI to handle
     */
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

/**
 * Coerces an expiry value to a valid positive number of seconds.
 * @param expiresIn - The raw expiry value to coerce
 * @param defaultSeconds - Fallback value when expiresIn is not a valid positive number
 * @returns The coerced expiry time in seconds
 */
export function coerceExpiresIn(
    expiresIn: unknown,
    defaultSeconds = DEFAULT_TOKEN_EXPIRES_IN_SECONDS,
): number {
    const num = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn);
    return Number.isFinite(num) && num > 0 ? num : defaultSeconds;
}

/**
 * Calculates the absolute token expiry timestamp from a relative duration.
 * @param expiresIn - Duration in seconds until the token expires
 * @returns The expiry time as a Unix timestamp in seconds
 */
export function calculateTokenExpiryTime(expiresIn: number) {
    const now = Math.floor(new Date().getTime() / 1000);
    return now + expiresIn;
}

export type LIGHTSPEED_USER_TYPE = 'Licensed' | 'Unlicensed' | 'Not logged in';

/**
 * Returns the user type label based on the organization subscription status.
 * @param rhOrgHasSubscription - Whether the Red Hat organization has an active subscription
 * @returns The user type classification
 */
export function getUserTypeLabel(rhOrgHasSubscription?: boolean): LIGHTSPEED_USER_TYPE {
    if (rhOrgHasSubscription === undefined) {
        return 'Not logged in';
    }
    return rhOrgHasSubscription ? 'Licensed' : 'Unlicensed';
}

/**
 * Extracts user and model information from a Lightspeed session.
 * @param sessionData - The authenticated user's session details
 * @returns An object containing user info and model info for the session
 */
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

/**
 * Returns the base URI for an API endpoint with trailing slash removed.
 * @param apiEndpoint - The API endpoint URL to normalize
 * @returns The normalized base URI
 */
export function getBaseUri(apiEndpoint: string): string {
    const trimmed = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
    return trimmed;
}

const VALID_DESKTOP_CALLBACK_SCHEMES = [
    'vscode',
    'vscodium',
    'vscode-insiders',
    'checode',
    'cursor',
];

/**
 * Checks whether a URI uses a supported desktop callback scheme.
 * @param uri - The URI to validate
 * @returns True if the URI scheme or authority is supported for OAuth callbacks
 */
export function isSupportedCallback(uri: Uri) {
    return (
        VALID_DESKTOP_CALLBACK_SCHEMES.includes(uri.scheme) ||
        uri.authority.endsWith('.openshiftapps.com') ||
        uri.authority.endsWith('.github.dev')
    );
}
