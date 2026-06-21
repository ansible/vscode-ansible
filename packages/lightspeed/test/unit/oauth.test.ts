import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExtensionContext } from '../helpers/mockContext';

const {
    mockRegisterAuthProvider,
    mockRegisterUriHandler,
    mockShowWarningMessage,
    mockExecuteCommand,
    mockWithProgress,
} = vi.hoisted(() => ({
    mockRegisterAuthProvider: vi.fn(() => ({ dispose: vi.fn() })),
    mockRegisterUriHandler: vi.fn(() => ({ dispose: vi.fn() })),
    mockShowWarningMessage: vi.fn(),
    mockExecuteCommand: vi.fn(),
    mockWithProgress: vi.fn((_opts: unknown, cb: Function) => cb()),
}));

vi.mock('vscode', () => {
    class MockEventEmitter<T> {
        private listeners: ((value: T) => void)[] = [];
        event = (listener: (value: T) => void) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
        fire(value: T) {
            for (const listener of this.listeners) listener(value);
        }
        dispose() {}
    }

    class MockDisposable {
        private disposables: { dispose(): void }[];
        constructor(...disposables: { dispose(): void }[]) {
            this.disposables = disposables;
        }
        static from(...disposables: { dispose(): void }[]) {
            return new MockDisposable(...disposables);
        }
        dispose() {
            for (const d of this.disposables) d.dispose();
        }
    }

    return {
        EventEmitter: MockEventEmitter,
        Disposable: MockDisposable,
        Uri: {
            parse: (s: string) => ({
                scheme: s.split('://')[0] || s,
                authority: '',
                path: '',
                query: '',
                fragment: '',
                with: (change: Record<string, string>) => ({
                    ...change,
                    toString: () => `${s}?${change.query ?? ''}`,
                }),
                toString: (skipEncoding?: boolean) => s,
            }),
        },
        authentication: {
            registerAuthenticationProvider: mockRegisterAuthProvider,
        },
        window: {
            registerUriHandler: mockRegisterUriHandler,
            showWarningMessage: mockShowWarningMessage,
            withProgress: mockWithProgress,
        },
        env: {
            openExternal: vi.fn(),
            asExternalUri: vi.fn((uri: unknown) => uri),
            uriScheme: 'vscode',
        },
        commands: {
            executeCommand: mockExecuteCommand,
        },
        ProgressLocation: { Notification: 15 },
    };
});

function mockFetchResponse(status: number, body: unknown, ok?: boolean): Response {
    return {
        status,
        ok: ok ?? (status >= 200 && status < 300),
        json: vi.fn().mockResolvedValue(body),
        headers: new Headers(),
        statusText: '',
        type: 'basic',
        url: '',
        redirected: false,
        body: null,
        bodyUsed: false,
        clone: vi.fn(),
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        text: vi.fn(),
        bytes: vi.fn(),
    } as unknown as Response;
}

import { LightSpeedAuthenticationProvider, type OAuthProviderConfig } from '../../src/oauth/provider';
import { SESSIONS_SECRET_KEY, ACCOUNT_SECRET_KEY } from '../../src/utils/webUtils';
import type { MockExtensionContext } from '../helpers/mockContext';

function createMockOAuthConfig(): OAuthProviderConfig {
    return {
        getApiEndpoint: vi.fn().mockReturnValue('https://test.example.com'),
        log: vi.fn(),
    };
}

describe('LightSpeedAuthenticationProvider', () => {
    let provider: LightSpeedAuthenticationProvider;
    let context: MockExtensionContext;
    let config: OAuthProviderConfig;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockRegisterAuthProvider.mockReturnValue({ dispose: vi.fn() });
        mockRegisterUriHandler.mockReturnValue({ dispose: vi.fn() });
        context = createMockExtensionContext();
        config = createMockOAuthConfig();
        provider = new LightSpeedAuthenticationProvider(context as any, config);
    });

    describe('initialize', () => {
        it('registers auth provider and URI handler', () => {
            provider.initialize();

            expect(mockRegisterAuthProvider).toHaveBeenCalledWith(
                'auth-lightspeed',
                'Ansible Lightspeed',
                provider,
                { supportsMultipleAccounts: false },
            );
            expect(mockRegisterUriHandler).toHaveBeenCalled();
        });

        it('does not register twice on repeated calls', () => {
            provider.initialize();
            provider.initialize();

            expect(mockRegisterAuthProvider).toHaveBeenCalledTimes(1);
        });
    });

    describe('getSessions', () => {
        it('returns empty array when no sessions stored', async () => {
            const sessions = await provider.getSessions();
            expect(sessions).toEqual([]);
        });

        it('returns stored sessions', async () => {
            const storedSessions = [
                {
                    id: 'test-id',
                    accessToken: 'token-abc',
                    account: { label: 'user (licensed)', id: 'test-id' },
                    scopes: [],
                    rhOrgHasSubscription: true,
                    rhUserIsOrgAdmin: false,
                },
            ];
            await context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(storedSessions));

            const sessions = await provider.getSessions();

            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe('test-id');
            expect(sessions[0].accessToken).toBe('token-abc');
            expect(sessions[0].rhOrgHasSubscription).toBe(true);
        });
    });

    describe('removeSession', () => {
        it('removes session from storage', async () => {
            const sessions = [
                {
                    id: 'session-1',
                    accessToken: 'token-1',
                    account: { label: 'user1', id: 'session-1' },
                    scopes: [],
                    rhOrgHasSubscription: true,
                    rhUserIsOrgAdmin: false,
                },
                {
                    id: 'session-2',
                    accessToken: 'token-2',
                    account: { label: 'user2', id: 'session-2' },
                    scopes: [],
                    rhOrgHasSubscription: false,
                    rhUserIsOrgAdmin: false,
                },
            ];
            await context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));

            await provider.removeSession('session-1');

            const stored = await context.secrets.get(SESSIONS_SECRET_KEY);
            const remaining = JSON.parse(stored!) as unknown[];
            expect(remaining).toHaveLength(1);
            expect((remaining[0] as { id: string }).id).toBe('session-2');
        });

        it('fires onDidChangeSessions with removed session', async () => {
            const sessions = [
                {
                    id: 'session-1',
                    accessToken: 'token-1',
                    account: { label: 'user1', id: 'session-1' },
                    scopes: [],
                    rhOrgHasSubscription: true,
                    rhUserIsOrgAdmin: false,
                },
            ];
            await context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));

            const changeListener = vi.fn();
            provider.onDidChangeSessions(changeListener);

            await provider.removeSession('session-1');

            expect(changeListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    added: [],
                    removed: [expect.objectContaining({ id: 'session-1' })],
                    changed: [],
                }),
            );
        });

        it('does nothing when no sessions stored', async () => {
            await expect(provider.removeSession('nonexistent')).resolves.toBeUndefined();
        });
    });

    describe('refreshAccessToken', () => {
        const mockSession = {
            id: 'session-1',
            accessToken: 'current-token',
            account: { label: 'user', id: 'session-1' },
            scopes: [],
        };

        it('returns current token when not expired', async () => {
            const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
            const account = {
                type: 'oauth',
                accessToken: 'current-token',
                refreshToken: 'refresh-token',
                expiresAtTimestampInSeconds: futureExpiry,
            };
            await context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));

            const token = await provider.refreshAccessToken(mockSession);

            expect(token).toBe('current-token');
        });

        it('refreshes token when expired', async () => {
            const pastExpiry = Math.floor(Date.now() / 1000) - 100;
            const account = {
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAtTimestampInSeconds: pastExpiry,
            };
            await context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));

            const sessions = [
                {
                    id: 'session-1',
                    accessToken: 'old-token',
                    account: { label: 'user', id: 'session-1' },
                    scopes: [],
                    rhOrgHasSubscription: true,
                    rhUserIsOrgAdmin: false,
                },
            ];
            await context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));

            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                mockFetchResponse(200, {
                    access_token: 'new-token',
                    refresh_token: 'new-refresh',
                    expires_in: 3600,
                }),
            );

            const token = await provider.refreshAccessToken(mockSession);

            expect(token).toBe('new-token');
        });

        it('throws when no account stored', async () => {
            await expect(provider.refreshAccessToken(mockSession)).rejects.toThrow(
                'Unable to fetch account',
            );
        });

        it('fires session changed event after refresh', async () => {
            const pastExpiry = Math.floor(Date.now() / 1000) - 100;
            const account = {
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAtTimestampInSeconds: pastExpiry,
            };
            await context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));

            const sessions = [
                {
                    id: 'session-1',
                    accessToken: 'old-token',
                    account: { label: 'user', id: 'session-1' },
                    scopes: [],
                    rhOrgHasSubscription: true,
                    rhUserIsOrgAdmin: false,
                },
            ];
            await context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));

            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                mockFetchResponse(200, {
                    access_token: 'refreshed-token',
                    refresh_token: 'new-refresh',
                    expires_in: 3600,
                }),
            );

            const changeListener = vi.fn();
            provider.onDidChangeSessions(changeListener);

            await provider.refreshAccessToken(mockSession);

            expect(changeListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    added: [],
                    removed: [],
                    changed: [expect.objectContaining({ id: 'session-1' })],
                }),
            );
        });

        it('removes session and shows reconnect when refresh returns undefined', async () => {
            const pastExpiry = Math.floor(Date.now() / 1000) - 100;
            const account = {
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAtTimestampInSeconds: pastExpiry,
            };
            await context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));

            const sessions = [
                {
                    id: 'session-1',
                    accessToken: 'old-token',
                    account: { label: 'user', id: 'session-1' },
                    scopes: [],
                    rhOrgHasSubscription: true,
                    rhUserIsOrgAdmin: false,
                },
            ];
            await context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));

            mockWithProgress.mockImplementation(async () => undefined);

            const token = await provider.refreshAccessToken(mockSession);

            expect(token).toBeUndefined();
            expect(mockShowWarningMessage).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('disposes registered providers', async () => {
            const mockDispose = vi.fn();
            mockRegisterAuthProvider.mockReturnValue({ dispose: mockDispose });
            mockRegisterUriHandler.mockReturnValue({ dispose: vi.fn() });

            provider.initialize();
            await provider.dispose();

            expect(mockDispose).toHaveBeenCalled();
        });

        it('handles dispose when not initialized', async () => {
            await expect(provider.dispose()).resolves.toBeUndefined();
        });
    });
});
