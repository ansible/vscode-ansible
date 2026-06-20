import {
    authentication,
    AuthenticationProvider,
    AuthenticationProviderAuthenticationSessionsChangeEvent,
    AuthenticationSession,
    commands,
    Disposable,
    env,
    EventEmitter,
    ExtensionContext,
    ProgressLocation,
    Uri,
    window,
} from 'vscode';
import crypto from 'crypto';
import { PromiseAdapter, promiseFromEvent } from '../utils/promiseHandlers';
import {
    generateCodeVerifier,
    UriEventHandler,
    OAuthAccount,
    calculateTokenExpiryTime,
    coerceExpiresIn,
    SESSIONS_SECRET_KEY,
    ACCOUNT_SECRET_KEY,
    getBaseUri,
    getUserTypeLabel,
    ANSIBLE_LIGHTSPEED_AUTH_ID,
    ANSIBLE_LIGHTSPEED_AUTH_NAME,
} from '../utils/webUtils';
import {
    LIGHTSPEED_CLIENT_ID,
    LIGHTSPEED_SERVICE_LOGIN_TIMEOUT,
    LightspeedCommands,
    LIGHTSPEED_API_TIMEOUT,
    WCA_API_ENDPOINT_DEFAULT,
} from '../definitions';
import type { LightspeedAuthSession } from '../interfaces';
import { getFetch } from '../api';

let _codeVerifier: string | undefined;

function getCodeVerifier(): string {
    return (_codeVerifier ??= generateCodeVerifier());
}

function getCodeChallenge(): string {
    const verifier = getCodeVerifier();
    return crypto
        .createHash('sha256')
        .update(new TextEncoder().encode(verifier))
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

const GRACE_TIME = 10;

export interface OAuthProviderConfig {
    getApiEndpoint(): string;
    log(level: 'info' | 'debug' | 'error', message: string): void;
}

export class LightSpeedAuthenticationProvider implements AuthenticationProvider, Disposable {
    private _sessionChangeEmitter =
        new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
    private _disposable: Disposable | undefined;
    private _uriHandler = new UriEventHandler();
    private _config: OAuthProviderConfig;
    private _externalRedirectUri = '';

    constructor(
        private readonly context: ExtensionContext,
        config: OAuthProviderConfig,
    ) {
        this._config = config;
    }

    public initialize() {
        if (this._disposable) {
            this._config.log('debug', '[ansible-lightspeed-oauth] Auth provider already registered');
            return;
        }
        this._disposable = Disposable.from(
            authentication.registerAuthenticationProvider(
                ANSIBLE_LIGHTSPEED_AUTH_ID,
                ANSIBLE_LIGHTSPEED_AUTH_NAME,
                this,
                { supportsMultipleAccounts: false },
            ),
            window.registerUriHandler(this._uriHandler),
        );
    }

    get onDidChangeSessions() {
        return this._sessionChangeEmitter.event;
    }

    public async getSessions(): Promise<LightspeedAuthSession[]> {
        const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
        if (allSessions) {
            return JSON.parse(allSessions) as LightspeedAuthSession[];
        }
        return [];
    }

    public async createSession(scopes: string[]): Promise<LightspeedAuthSession> {
        try {
            const account = await this.login(scopes);
            if (!account) {
                throw new Error('Ansible Lightspeed login failure');
            }

            const userinfo = await this.fetchUserInfo(account.accessToken);
            const identifier = crypto.randomUUID();
            const userName = userinfo.external_username || userinfo.username || '';
            const rhOrgHasSubscription = userinfo.rh_org_has_subscription ?? false;
            const userTypeLabel = getUserTypeLabel(rhOrgHasSubscription).toLowerCase();
            const label = `${userName} (${userTypeLabel})`;

            const session: LightspeedAuthSession = {
                id: identifier,
                accessToken: account.accessToken,
                account: { label, id: identifier },
                scopes: [],
                rhOrgHasSubscription,
                rhUserIsOrgAdmin: userinfo.rh_user_is_org_admin ?? false,
            };

            await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify([session]));
            this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });
            this._config.log('debug', '[ansible-lightspeed-oauth] Session created...');
            return session;
        } catch (e) {
            console.error(
                `[ansible-lightspeed-oauth] Sign in failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            throw e;
        }
    }

    public async removeSession(sessionId: string): Promise<void> {
        const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
        if (allSessions) {
            const sessions = JSON.parse(allSessions) as LightspeedAuthSession[];
            const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
            const session = sessions[sessionIdx];
            sessions.splice(sessionIdx, 1);
            await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));
            if (session) {
                this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
            }
        }
    }

    public async dispose() {
        if (this._disposable) {
            this._config.log('debug', '[ansible-lightspeed-oauth] Disposing auth provider');
            await this._disposable.dispose();
            this._disposable = undefined;
        }
    }

    private async login(_scopes: string[] = []) {
        this._config.log('debug', '[ansible-lightspeed-oauth] Logging in...');

        const callbackUri = await env.asExternalUri(
            Uri.parse(this.getRedirectUri()),
        );
        this._externalRedirectUri = callbackUri.toString(true);

        const searchParams = new URLSearchParams([
            ['response_type', 'code'],
            ['code_challenge', getCodeChallenge()],
            ['code_challenge_method', 'S256'],
            ['client_id', LIGHTSPEED_CLIENT_ID],
            ['redirect_uri', this._externalRedirectUri],
        ]);

        const baseUri = getBaseUri(this._config.getApiEndpoint() || WCA_API_ENDPOINT_DEFAULT);
        const query = searchParams.toString();
        const uri = Uri.parse(baseUri).with({ path: '/o/authorize/', query });

        const { promise: receivedRedirectUrl, cancel: cancelWaitingForRedirectUrl } =
            promiseFromEvent(this._uriHandler.event, this.handleUriForCode());

        await env.openExternal(uri);

        const account = await window.withProgress(
            {
                title: 'Waiting for authentication redirect from Ansible Lightspeed',
                location: ProgressLocation.Notification,
                cancellable: true,
            },
            async (_, token): Promise<OAuthAccount> => {
                try {
                    return await Promise.race<OAuthAccount>([
                        receivedRedirectUrl,
                        new Promise<OAuthAccount>((_, reject) => {
                            setTimeout(() => {
                                reject(
                                    new Error(
                                        'Cancelling the Ansible Lightspeed login after 60s. Try again.',
                                    ),
                                );
                            }, LIGHTSPEED_SERVICE_LOGIN_TIMEOUT);
                        }),
                        promiseFromEvent(token.onCancellationRequested, (_, __, reject) => {
                            reject('User Cancelled');
                        }).promise as Promise<OAuthAccount>,
                    ]);
                } finally {
                    cancelWaitingForRedirectUrl.fire();
                }
            },
        );

        return account;
    }

    private getRedirectUri() {
        const manifest = this.context.extension.packageJSON as {
            publisher?: string;
            name?: string;
        };
        const publisher = manifest.publisher ?? '';
        const name = manifest.name ?? '';
        return `${env.uriScheme}://${publisher}.${name}`;
    }

    private handleUriForCode: () => PromiseAdapter<Uri, OAuthAccount> =
        () => async (uri, resolve, reject) => {
            const query = new URLSearchParams(uri.query);
            const code = query.get('code');
            if (!code) {
                reject(new Error('No code received from the OAuth Server'));
                return;
            }
            const account = await this.requestOAuthAccountFromCode(code);
            if (!account) {
                reject(new Error('Unable to form account'));
                return;
            }
            resolve(account);
        };

    private async requestOAuthAccountFromCode(code: string): Promise<OAuthAccount | undefined> {
        this._config.log('debug', '[ansible-lightspeed-oauth] Requesting access token...');
        try {
            const fetch = getFetch();
            const baseUri = getBaseUri(this._config.getApiEndpoint() || WCA_API_ENDPOINT_DEFAULT);
            const response = await fetch(`${baseUri}/o/token/`, {
                method: 'POST',
                signal: AbortSignal.timeout(LIGHTSPEED_API_TIMEOUT),
                body: `client_id=${encodeURIComponent(LIGHTSPEED_CLIENT_ID)}&code_verifier=${encodeURIComponent(getCodeVerifier())}&grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(this._externalRedirectUri)}`,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            interface OAuthTokenResponse {
                access_token?: string;
                refresh_token?: string;
                expires_in?: unknown;
            }
            const data = (await response.json()) as OAuthTokenResponse;

            if (response.ok) {
                const account: OAuthAccount = {
                    type: 'oauth',
                    accessToken: data.access_token ?? '',
                    refreshToken: data.refresh_token ?? '',
                    expiresAtTimestampInSeconds: calculateTokenExpiryTime(
                        coerceExpiresIn(data.expires_in),
                    ),
                };
                this.context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));
                return account;
            } else {
                throw new Error(`Token request failed with status: ${response.status}`);
            }
        } catch (error) {
            const err = error as Error;
            console.error(`[ansible-lightspeed-oauth] Error: ${err.message}`);
            throw err;
        }
    }

    private async requestTokenAfterExpiry(
        currentAccount: OAuthAccount,
    ): Promise<OAuthAccount | undefined> {
        return await window.withProgress(
            { title: 'Refreshing token', location: ProgressLocation.Notification },
            async () => {
                try {
                    const fetch = getFetch();
                    const baseUri = getBaseUri(
                        this._config.getApiEndpoint() || WCA_API_ENDPOINT_DEFAULT,
                    );
                    const response = await fetch(`${baseUri}/o/token/`, {
                        method: 'POST',
                        signal: AbortSignal.timeout(LIGHTSPEED_API_TIMEOUT),
                        body: `client_id=${encodeURIComponent(LIGHTSPEED_CLIENT_ID)}&refresh_token=${encodeURIComponent(currentAccount.refreshToken)}&grant_type=refresh_token`,
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    });

                    interface OAuthTokenResponse {
                        access_token?: string;
                        refresh_token?: string;
                        expires_in?: unknown;
                    }
                    const data = (await response.json()) as OAuthTokenResponse;

                    if (response.ok) {
                        const account: OAuthAccount = {
                            ...currentAccount,
                            accessToken: data.access_token ?? currentAccount.accessToken,
                            refreshToken: data.refresh_token ?? currentAccount.refreshToken,
                            expiresAtTimestampInSeconds: calculateTokenExpiryTime(
                                coerceExpiresIn(data.expires_in),
                            ),
                        };
                        this.context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));
                        return account;
                    } else {
                        throw new Error(`Token refresh failed with status: ${response.status}`);
                    }
                } catch (error) {
                    const err = error as Error;
                    console.error(`[ansible-lightspeed-oauth] Refresh error: ${err.message}`);
                    throw err;
                }
            },
        );
    }

    public async refreshAccessToken(session: AuthenticationSession) {
        const sessionId = session.id;
        const account = await this.context.secrets.get(ACCOUNT_SECRET_KEY);
        if (!account) {
            throw new Error('Unable to fetch account');
        }

        const currentAccount = JSON.parse(account) as OAuthAccount;
        let tokenToBeReturned = currentAccount.accessToken;

        const timeNow = Math.floor(new Date().getTime() / 1000);
        if (timeNow >= currentAccount.expiresAtTimestampInSeconds - GRACE_TIME) {
            this._config.log('debug', '[ansible-lightspeed-oauth] Token expired. Refreshing...');
            const result = await this.requestTokenAfterExpiry(currentAccount);

            if (!result) {
                await this.removeSession(sessionId);
                const selection = await window.showWarningMessage(
                    'Your Ansible Lightspeed session has expired.\n',
                    'Reconnect',
                );
                if (selection === 'Reconnect') {
                    commands.executeCommand(LightspeedCommands.LIGHTSPEED_AUTH_REQUEST);
                }
                return;
            }

            await this.context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(result));
            tokenToBeReturned = result.accessToken;

            const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
            if (allSessions) {
                const sessions = JSON.parse(allSessions) as LightspeedAuthSession[];
                const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
                const existingSession = sessions[sessionIdx];
                const freshSession: LightspeedAuthSession = {
                    ...existingSession,
                    accessToken: tokenToBeReturned,
                };
                sessions.splice(sessionIdx, 1, freshSession);
                await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));
                this._sessionChangeEmitter.fire({ added: [], removed: [], changed: [existingSession] });
            }
        }

        return tokenToBeReturned;
    }

    private async fetchUserInfo(
        token: string,
    ): Promise<{
        username?: string;
        external_username: string;
        rh_org_has_subscription?: boolean;
        rh_user_is_org_admin?: boolean;
    }> {
        const fetch = getFetch();
        const baseUri = getBaseUri(this._config.getApiEndpoint() || WCA_API_ENDPOINT_DEFAULT);
        const response = await fetch(`${baseUri}/api/v0/me/`, {
            method: 'GET',
            signal: AbortSignal.timeout(LIGHTSPEED_API_TIMEOUT),
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`User info request failed: ${response.status}`);
        }
        return (await response.json()) as {
            username?: string;
            external_username: string;
            rh_org_has_subscription?: boolean;
            rh_user_is_org_admin?: boolean;
        };
    }
}
