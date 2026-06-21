import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
    EventEmitter: class MockEventEmitter<T> {
        private listeners: ((value: T) => void)[] = [];
        event = (listener: (value: T) => void) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
        fire(value: T) {
            for (const listener of this.listeners) listener(value);
        }
        dispose() {}
    },
    Uri: {
        parse: (s: string) => ({ scheme: s.split('://')[0] || s, authority: '', path: '', query: '', fragment: '', toString: () => s }),
    },
}));

import {
    generateCodeVerifier,
    coerceExpiresIn,
    calculateTokenExpiryTime,
    getUserTypeLabel,
    getLoggedInUserDetails,
    getBaseUri,
    isSupportedCallback,
    UriEventHandler,
    ANSIBLE_LIGHTSPEED_AUTH_ID,
    ANSIBLE_LIGHTSPEED_AUTH_NAME,
    SESSIONS_SECRET_KEY,
    ACCOUNT_SECRET_KEY,
} from '../../src/utils/webUtils';

describe('webUtils', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('constants', () => {
        it('exports correct auth constants', () => {
            expect(ANSIBLE_LIGHTSPEED_AUTH_ID).toBe('auth-lightspeed');
            expect(ANSIBLE_LIGHTSPEED_AUTH_NAME).toBe('Ansible Lightspeed');
            expect(SESSIONS_SECRET_KEY).toBe('auth-lightspeed.sessions');
            expect(ACCOUNT_SECRET_KEY).toBe('Ansible Lightspeed.account');
        });
    });

    describe('generateCodeVerifier', () => {
        it('returns a string of at least 50 characters', () => {
            const verifier = generateCodeVerifier();
            expect(verifier.length).toBeGreaterThanOrEqual(50);
        });

        it('returns only alphanumeric characters', () => {
            const verifier = generateCodeVerifier();
            expect(verifier).toMatch(/^[a-zA-Z0-9]+$/);
        });

        it('returns different values on each call', () => {
            const a = generateCodeVerifier();
            const b = generateCodeVerifier();
            expect(a).not.toBe(b);
        });
    });

    describe('coerceExpiresIn', () => {
        it('returns the number when given a positive number', () => {
            expect(coerceExpiresIn(1800)).toBe(1800);
        });

        it('returns default when given undefined', () => {
            expect(coerceExpiresIn(undefined)).toBe(3600);
        });

        it('returns default when given null', () => {
            expect(coerceExpiresIn(null)).toBe(3600);
        });

        it('returns default when given NaN', () => {
            expect(coerceExpiresIn(NaN)).toBe(3600);
        });

        it('returns default when given zero', () => {
            expect(coerceExpiresIn(0)).toBe(3600);
        });

        it('returns default when given negative number', () => {
            expect(coerceExpiresIn(-100)).toBe(3600);
        });

        it('coerces string numbers', () => {
            expect(coerceExpiresIn('7200')).toBe(7200);
        });

        it('returns custom default when provided', () => {
            expect(coerceExpiresIn(undefined, 900)).toBe(900);
        });

        it('returns default for non-numeric string', () => {
            expect(coerceExpiresIn('not-a-number')).toBe(3600);
        });

        it('returns default for Infinity', () => {
            expect(coerceExpiresIn(Infinity)).toBe(3600);
        });
    });

    describe('calculateTokenExpiryTime', () => {
        it('returns a future timestamp', () => {
            const now = Math.floor(Date.now() / 1000);
            const result = calculateTokenExpiryTime(3600);
            expect(result).toBeGreaterThanOrEqual(now + 3599);
            expect(result).toBeLessThanOrEqual(now + 3601);
        });

        it('handles small expiry values', () => {
            const now = Math.floor(Date.now() / 1000);
            const result = calculateTokenExpiryTime(10);
            expect(result).toBeGreaterThanOrEqual(now + 9);
            expect(result).toBeLessThanOrEqual(now + 11);
        });
    });

    describe('getUserTypeLabel', () => {
        it('returns "Licensed" when org has subscription', () => {
            expect(getUserTypeLabel(true)).toBe('Licensed');
        });

        it('returns "Unlicensed" when org has no subscription', () => {
            expect(getUserTypeLabel(false)).toBe('Unlicensed');
        });

        it('returns "Not logged in" when undefined', () => {
            expect(getUserTypeLabel(undefined)).toBe('Not logged in');
        });

        it('returns "Not logged in" when called without arguments', () => {
            expect(getUserTypeLabel()).toBe('Not logged in');
        });
    });

    describe('getLoggedInUserDetails', () => {
        it('returns default info when no session data', () => {
            const result = getLoggedInUserDetails();
            expect(result.userInfo.userType).toBe('Not logged in');
            expect(result.userInfo.role).toBeUndefined();
            expect(result.userInfo.subscribed).toBeUndefined();
            expect(result.modelInfo).toEqual({});
        });

        it('returns Licensed user with admin role', () => {
            const result = getLoggedInUserDetails({
                rhOrgHasSubscription: true,
                rhUserIsOrgAdmin: true,
            });
            expect(result.userInfo.userType).toBe('Licensed');
            expect(result.userInfo.role).toBe('Administrator');
            expect(result.userInfo.subscribed).toBe(true);
        });

        it('returns Licensed user without admin role', () => {
            const result = getLoggedInUserDetails({
                rhOrgHasSubscription: true,
                rhUserIsOrgAdmin: false,
            });
            expect(result.userInfo.userType).toBe('Licensed');
            expect(result.userInfo.role).toBeUndefined();
            expect(result.userInfo.subscribed).toBe(true);
        });

        it('returns Unlicensed user', () => {
            const result = getLoggedInUserDetails({
                rhOrgHasSubscription: false,
            });
            expect(result.userInfo.userType).toBe('Unlicensed');
            expect(result.userInfo.subscribed).toBeUndefined();
        });
    });

    describe('getBaseUri', () => {
        it('removes trailing slash', () => {
            expect(getBaseUri('https://example.com/')).toBe('https://example.com');
        });

        it('leaves URLs without trailing slash unchanged', () => {
            expect(getBaseUri('https://example.com')).toBe('https://example.com');
        });

        it('handles URLs with paths', () => {
            expect(getBaseUri('https://example.com/api/v1/')).toBe('https://example.com/api/v1');
        });

        it('handles empty string', () => {
            expect(getBaseUri('')).toBe('');
        });
    });

    describe('isSupportedCallback', () => {
        it('accepts vscode scheme', () => {
            expect(isSupportedCallback({ scheme: 'vscode', authority: '', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('accepts vscodium scheme', () => {
            expect(isSupportedCallback({ scheme: 'vscodium', authority: '', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('accepts vscode-insiders scheme', () => {
            expect(isSupportedCallback({ scheme: 'vscode-insiders', authority: '', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('accepts checode scheme', () => {
            expect(isSupportedCallback({ scheme: 'checode', authority: '', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('accepts cursor scheme', () => {
            expect(isSupportedCallback({ scheme: 'cursor', authority: '', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('accepts openshiftapps.com authority', () => {
            expect(isSupportedCallback({ scheme: 'https', authority: 'workspaces.openshift.openshiftapps.com', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('accepts github.dev authority', () => {
            expect(isSupportedCallback({ scheme: 'https', authority: 'user.github.dev', path: '', query: '', fragment: '' } as any)).toBe(true);
        });

        it('rejects unsupported scheme and authority', () => {
            expect(isSupportedCallback({ scheme: 'http', authority: 'localhost', path: '', query: '', fragment: '' } as any)).toBe(false);
        });
    });

    describe('UriEventHandler', () => {
        it('fires event when handleUri is called', () => {
            const handler = new UriEventHandler();
            const listener = vi.fn();
            handler.event(listener);

            const mockUri = { scheme: 'vscode', authority: '', path: '/callback', query: 'code=abc', fragment: '' };
            handler.handleUri(mockUri as any);

            expect(listener).toHaveBeenCalledWith(mockUri);
        });
    });
});
