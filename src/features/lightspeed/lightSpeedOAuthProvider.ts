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
} from "vscode";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import http from "http";
import { AddressInfo } from "net";
import {
  PromiseAdapter,
  promiseFromEvent,
} from "@src/features/lightspeed/utils/promiseHandlers";
import { SettingsManager } from "@src/settings";
import {
  generateCodeVerifier,
  UriEventHandler,
  OAuthAccount,
  calculateTokenExpiryTime,
  SESSIONS_SECRET_KEY,
  ACCOUNT_SECRET_KEY,
  getBaseUri,
  getUserTypeLabel,
} from "@src/features/lightspeed/utils/webUtils";
import {
  LIGHTSPEED_CLIENT_ID,
  LIGHTSPEED_SERVICE_LOGIN_TIMEOUT,
  LightSpeedCommands,
} from "@src/definitions/lightspeed";
import { LightspeedAuthSession } from "@src/interfaces/lightspeed";
import { lightSpeedManager } from "@src/extension";
import { ANSIBLE_LIGHTSPEED_API_TIMEOUT } from "@src/definitions/constants";
import { Log } from "@src/utils/logger";
import { getFetch } from "@src/features/lightspeed/api";

// Lazy initialization to avoid module loading order issues
let _codeVerifier: string | undefined;

function getCodeVerifier(): string {
  return (_codeVerifier ??= generateCodeVerifier());
}

function getCodeChallenge(): string {
  const verifier = getCodeVerifier();
  return crypto
    .createHash("sha256")
    .update(new TextEncoder().encode(verifier))
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Grace time for sending request to refresh token
const GRACE_TIME = 10;

const VALID_DESKTOP_CALLBACK_SCHEMES = [
  "vscode",
  "vscodium",
  "vscode-insiders",
  "checode",
  "cursor",
];
export function isSupportedCallback(uri: Uri) {
  return (
    VALID_DESKTOP_CALLBACK_SCHEMES.includes(uri.scheme) ||
    // openshift devspaces
    /\.openshiftapps\.com$/.test(uri.authority) ||
    // github codespaces
    /\.github\.dev$/.test(uri.authority)
  );
}

export class LightSpeedAuthenticationProvider
  implements AuthenticationProvider, Disposable
{
  public settingsManager: SettingsManager;
  private _sessionChangeEmitter =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: Disposable | undefined;
  private _uriHandler = new UriEventHandler();
  private _logger: Log;
  private _authId: string;
  private _authName: string;
  private _externalRedirectUri: string;

  constructor(
    private readonly context: ExtensionContext,
    settingsManager: SettingsManager,
    logger: Log,
    authId: string,
    authName: string,
    externalRedirectUri = "",
  ) {
    this.settingsManager = settingsManager;
    this._logger = logger;
    this._authId = authId;
    this._authName = authName;
    this._externalRedirectUri = externalRedirectUri;
  }

  public initialize() {
    if (this._disposable) {
      this._logger.debug(
        "[ansible-lightspeed-oauth] Auth provider already registered",
      );
      return;
    }

    this._disposable = Disposable.from(
      authentication.registerAuthenticationProvider(
        this._authId,
        this._authName,
        this,
        { supportsMultipleAccounts: false },
      ),
      window.registerUriHandler(this._uriHandler),
    );
  }

  async setExternalRedirectUri() {
    const callbackUri =
      await LightSpeedAuthenticationProvider.getExternalRedirectUri(
        this.context,
      );
    this._externalRedirectUri = callbackUri.toString(true);
  }

  public static async getExternalRedirectUri(context: ExtensionContext) {
    return await env.asExternalUri(
      Uri.parse(LightSpeedAuthenticationProvider.getRedirectUri(context)),
    );
  }

  private static getRedirectUri(context: ExtensionContext) {
    const publisher = context.extension.packageJSON.publisher;
    const name = context.extension.packageJSON.name;

    return `${env.uriScheme}://${publisher}.${name}`;
  }

  get onDidChangeSessions() {
    return this._sessionChangeEmitter.event;
  }

  /**
   * Get the existing sessions
   * @param scopes - Scopes
   * @returns
   */
  public async getSessions(): Promise<LightspeedAuthSession[]> {
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);

    if (allSessions) {
      return JSON.parse(allSessions) as LightspeedAuthSession[];
    }

    return [];
  }

  /**
   * Create a new auth session
   * @param scopes - Scopes
   * @returns
   */
  public async createSession(scopes: string[]): Promise<LightspeedAuthSession> {
    try {
      lightSpeedManager.currentModelValue = undefined;
      const account = await this.login(scopes);

      if (!account) {
        throw new Error(`Ansible Lightspeed login failure`);
      }

      const userinfo =
        await lightSpeedManager.lightspeedAuthenticatedUser.getUserInfo(
          account.accessToken,
        );

      const identifier = uuid();
      const userName = userinfo.external_username || userinfo.username || "";
      const rhOrgHasSubscription = userinfo.rh_org_has_subscription
        ? userinfo.rh_org_has_subscription
        : false;

      const userTypeLabel =
        getUserTypeLabel(rhOrgHasSubscription).toLowerCase();
      const label = `${userName} (${userTypeLabel})`;
      const session: LightspeedAuthSession = {
        id: identifier,
        accessToken: account.accessToken,
        account: {
          label,
          id: identifier,
        },
        // scopes: account.scope,
        scopes: [],
        rhOrgHasSubscription: userinfo.rh_org_has_subscription
          ? userinfo.rh_org_has_subscription
          : false,
        rhUserIsOrgAdmin: userinfo.rh_user_is_org_admin
          ? userinfo.rh_user_is_org_admin
          : false,
      };
      await this.context.secrets.store(
        SESSIONS_SECRET_KEY,
        JSON.stringify([session]),
      );

      this._sessionChangeEmitter.fire({
        added: [session],
        removed: [],
        changed: [],
      });

      this._logger.debug("[ansible-lightspeed-oauth] Session created...");

      return session;
    } catch (e) {
      console.error(
        `[ansible-lightspeed-oauth] Ansible Lightspeed sign in failed: ${e}`,
      );
      throw e;
    }
  }

  /**
   * Remove an existing session
   * @param sessionId - Session ID
   */
  public async removeSession(sessionId: string): Promise<void> {
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
    if (allSessions) {
      const sessions = JSON.parse(allSessions) as LightspeedAuthSession[];
      const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);

      await this.context.secrets.store(
        SESSIONS_SECRET_KEY,
        JSON.stringify(sessions),
      );

      if (session) {
        this._sessionChangeEmitter.fire({
          added: [],
          removed: [session],
          changed: [],
        });
      }
    }
  }

  /**
   * Dispose the registered services
   */
  public async dispose() {
    if (this._disposable) {
      const account = await this.isAuthenticated();

      if (account) {
        const sessionId = account.id;
        this.removeSession(sessionId);
      }

      this._logger.debug("[ansible-lightspeed-oauth] Disposing auth provider");
      await this._disposable.dispose();
      this._disposable = undefined;
    }
  }

  /**
   * Start a local HTTP server to receive the OAuth callback.
   * Returns a promise that resolves with the authorization code and
   * a cleanup function to shut down the server.
   */
  private async startLocalCallbackServer(): Promise<{
    redirectUri: string;
    codePromise: Promise<string>;
    close: () => void;
  }> {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;
    const codePromise = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      if (code) {
        res.end(
          "<html><body><h1>Authentication successful</h1><p>You can close this tab and return to your editor.</p></body></html>",
        );
        resolveCode(code);
      } else {
        res.end(
          "<html><body><h1>Authentication failed</h1><p>Something went wrong. Return to your editor for details.</p></body></html>",
        );
        rejectCode(
          new Error(error || "No authorization code received from the server"),
        );
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const port = (server.address() as AddressInfo).port;
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    this._logger.debug(
      `[ansible-lightspeed-oauth] Local callback server listening on ${redirectUri}`,
    );

    const close = () => {
      server.close();
    };

    return { redirectUri, codePromise, close };
  }

  private static readonly LOOPBACK_CALLBACK_HOSTS = [
    "https://c.ai.ansible.redhat.com",
    "https://stage.ai.ansible.redhat.com",
  ];

  /* Log in to the Ansible Lightspeed auth service */
  private async login(_scopes: string[] = []) {
    this._logger.debug("[ansible-lightspeed-oauth] Logging in...");

    await this.setExternalRedirectUri();

    const base_uri = await getBaseUri(this.settingsManager);
    if (!base_uri) {
      throw new Error(
        "Please enter the Ansible Lightspeed URL under the Ansible Lightspeed settings!",
      );
    }

    const useLoopback =
      LightSpeedAuthenticationProvider.LOOPBACK_CALLBACK_HOSTS.includes(
        base_uri,
      );

    let localServer:
      | Awaited<ReturnType<typeof this.startLocalCallbackServer>>
      | undefined;
    let redirectUri: string;

    if (useLoopback) {
      localServer = await this.startLocalCallbackServer();
      redirectUri = localServer.redirectUri;
      this._logger.debug(
        `[ansible-lightspeed-oauth] Using local callback redirect URI: ${redirectUri}`,
      );
    } else {
      redirectUri = this._externalRedirectUri;
      this._logger.debug(
        `[ansible-lightspeed-oauth] Using external redirect URI: ${redirectUri}`,
      );
    }

    const searchParams = new URLSearchParams([
      ["response_type", "code"],
      ["code_challenge", getCodeChallenge()],
      ["code_challenge_method", "S256"],
      ["client_id", LIGHTSPEED_CLIENT_ID],
      ["redirect_uri", redirectUri],
    ]);

    const query = searchParams.toString();
    const uri = Uri.parse(base_uri).with({ path: "/o/authorize/", query });

    const {
      promise: receivedRedirectUrl,
      cancel: cancelWaitingForRedirectUrl,
    } = promiseFromEvent(
      this._uriHandler.event,
      this.handleUriForCode(redirectUri),
    );

    await env.openExternal(uri);

    const account = await window.withProgress(
      {
        title: "Waiting for authentication redirect from Ansible Lightspeed",
        location: ProgressLocation.Notification,
        cancellable: true,
      },
      async (_, token): Promise<OAuthAccount> => {
        try {
          const candidates: Promise<OAuthAccount>[] = [
            receivedRedirectUrl,
            new Promise<OAuthAccount>((_, reject) => {
              setTimeout(() => {
                reject(
                  new Error(
                    "Cancelling the Ansible Lightspeed login after 60s. Try again.",
                  ),
                );
              }, LIGHTSPEED_SERVICE_LOGIN_TIMEOUT);
            }),
            promiseFromEvent(token.onCancellationRequested, (_, __, reject) => {
              reject("User Cancelled");
            }).promise as Promise<OAuthAccount>,
          ];

          if (localServer) {
            candidates.push(
              localServer.codePromise.then((code) =>
                this.requestOAuthAccountFromCode(code, redirectUri),
              ) as Promise<OAuthAccount>,
            );
          }

          return await Promise.race<OAuthAccount>(candidates);
        } finally {
          localServer?.close();
          cancelWaitingForRedirectUrl.fire();
        }
      },
    );

    return account;
  }

  /* Handle the redirect to VS Code (after sign in from the Ansible Lightspeed auth service) */
  private handleUriForCode: (
    redirectUri: string,
  ) => PromiseAdapter<Uri, OAuthAccount> =
    (redirectUri) => async (uri, resolve, reject) => {
      const query = new URLSearchParams(uri.query);
      const code = query.get("code");

      if (!code) {
        reject(
          new Error(
            "No code received from the Ansible Lightspeed OAuth Server",
          ),
        );
        return;
      }

      const account = await this.requestOAuthAccountFromCode(code, redirectUri);

      if (!account) {
        reject(new Error("Unable to form account"));
        return;
      }

      resolve(account);
    };

  /* Request access token from server using code */
  private async requestOAuthAccountFromCode(
    code: string,
    redirectUri: string,
  ): Promise<OAuthAccount | undefined> {
    const headers = {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    this._logger.debug(
      "[ansible-lightspeed-oauth] Sending request for access token...",
    );

    try {
      const fetch = getFetch();

      const response = await fetch(
        `${await getBaseUri(this.settingsManager)}/o/token/`,
        {
          method: "POST",
          signal: AbortSignal.timeout(ANSIBLE_LIGHTSPEED_API_TIMEOUT),
          body: `client_id=${encodeURIComponent(LIGHTSPEED_CLIENT_ID)}&code_verifier=${encodeURIComponent(getCodeVerifier())}&grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
          headers,
        },
      );

      const data = await response.json();

      if (response.ok) {
        const account: OAuthAccount = {
          type: "oauth",
          accessToken: data?.access_token,
          refreshToken: data?.refresh_token,
          expiresAtTimestampInSeconds: calculateTokenExpiryTime(
            data?.expires_in,
          ),
          // scope: data.scope,
        };
        // store the account info
        this.context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));

        return account;
      } else {
        console.error(
          `[ansible-lightspeed-oauth] call to get access token returned non-2xx response. Status: ${response.status}. Body: `,
          data,
        );

        throw new Error(`Request failed with status code: ${response.status}`);
      }
    } catch (error) {
      const err = error as Error;
      console.error(
        `[ansible-lightspeed-oauth] Error occurred: ${err.message}`,
        {
          name: err.name,
          message: err.message,
          stack: err.stack,
          cause: err.cause, // undici errors often have a cause
          code: (err as NodeJS.ErrnoException).code, // network error codes
        },
      );
      throw err;
    }
  }

  /* Request new access token using refresh token */
  private async requestTokenAfterExpiry(
    currentAccount: OAuthAccount,
  ): Promise<OAuthAccount | undefined> {
    const headers = {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    this._logger.trace(
      "[ansible-lightspeed-oauth] Sending request for a new access token...",
    );

    const account = await window.withProgress(
      {
        title: "Refreshing token",
        location: ProgressLocation.Notification,
      },
      async () => {
        try {
          const fetch = getFetch();

          const response = await fetch(
            `${await getBaseUri(this.settingsManager)}/o/token/`,
            {
              method: "POST",
              signal: AbortSignal.timeout(ANSIBLE_LIGHTSPEED_API_TIMEOUT),
              body: `client_id=${encodeURIComponent(LIGHTSPEED_CLIENT_ID)}&refresh_token=${encodeURIComponent(currentAccount.refreshToken)}&grant_type=refresh_token`,
              headers,
            },
          );

          const data = await response.json();

          if (response.ok) {
            const account: OAuthAccount = {
              ...currentAccount,
              accessToken: data?.access_token,
              refreshToken: data?.refresh_token,
              expiresAtTimestampInSeconds: calculateTokenExpiryTime(
                data?.expires_in,
              ),
              // scope: data.scope,
            };

            // store the account info
            this.context.secrets.store(
              ACCOUNT_SECRET_KEY,
              JSON.stringify(account),
            );

            return account;
          } else {
            console.error(
              `[ansible-lightspeed-oauth] call to get new access token returned non-2xx response. Status: ${response.status}. Body: `,
              data,
            );

            throw new Error(
              `Request failed with status code: ${response.status}`,
            );
          }
        } catch (error) {
          const err = error as Error;
          console.error(
            `[ansible-lightspeed-oauth] Error occurred: ${err.message}`,
            {
              name: err.name,
              message: err.message,
              stack: err.stack,
              cause: err.cause, // undici errors often have a cause
              code: (err as NodeJS.ErrnoException).code, // network error codes
            },
          );
          throw err;
        }
      },
    );

    return account ? account : undefined;
  }

  /**
   * Method that returns access token to be used in API calls
   * The method also checks if the token is expired or not, if so,
   * it requests for a new token and updates the secret store
   */
  public async refreshAccessToken(session: AuthenticationSession) {
    this._logger.trace("[ansible-lightspeed-oauth] Refresh access token...");

    const sessionId = session.id;

    const account = await this.context.secrets.get(ACCOUNT_SECRET_KEY);
    if (!account) {
      throw new Error(`Unable to fetch account`);
    }

    this._logger.trace("[ansible-lightspeed-oauth] Account found");

    const currentAccount: OAuthAccount = JSON.parse(account);
    let tokenToBeReturned = currentAccount.accessToken;

    // check if token needs to be refreshed
    const timeNow = Math.floor(new Date().getTime() / 1000);
    if (timeNow >= currentAccount["expiresAtTimestampInSeconds"] - GRACE_TIME) {
      this._logger.debug(
        "[ansible-lightspeed-oauth] Ansible Lightspeed token expired. Getting new token...",
      );

      const result = await this.requestTokenAfterExpiry(currentAccount);
      this._logger.info(
        "[ansible-lightspeed-oauth] New Ansible Lightspeed token received.",
      );

      if (!result) {
        await this.removeSession(sessionId);
        const selection = await window.showWarningMessage(
          "Your Ansible Lightspeed session has expired.\n",
          "Reconnect",
        );
        if (selection === "Reconnect") {
          commands.executeCommand(LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST);
        }
        return;
      }

      const newAccount: OAuthAccount = result;

      await this.context.secrets.store(
        ACCOUNT_SECRET_KEY,
        JSON.stringify(newAccount),
      );

      tokenToBeReturned = newAccount.accessToken;

      // change the session id of the existing session
      const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
      if (allSessions) {
        const sessions = JSON.parse(allSessions) as LightspeedAuthSession[];
        const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
        const session = sessions[sessionIdx];
        const freshSession: LightspeedAuthSession = {
          ...session,
          accessToken: tokenToBeReturned,
        };
        sessions.splice(sessionIdx, 1, freshSession);

        await this.context.secrets.store(
          SESSIONS_SECRET_KEY,
          JSON.stringify(sessions),
        );

        this._sessionChangeEmitter.fire({
          added: [],
          removed: [],
          changed: [session],
        });
      }
    }

    return tokenToBeReturned;
  }

  /* Return session info if user is authenticated, else undefined */
  private async isAuthenticated(): Promise<AuthenticationSession | undefined> {
    // check if the user is authenticated
    const userAuth = await authentication.getSession(this._authId, [], {
      createIfNone: false,
    });

    return userAuth;
  }
}
