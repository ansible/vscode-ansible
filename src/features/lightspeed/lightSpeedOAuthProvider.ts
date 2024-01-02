/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable tsdoc/syntax */
import {
  authentication,
  AuthenticationProvider,
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationSession,
  Disposable,
  env,
  EventEmitter,
  ExtensionContext,
  ProgressLocation,
  Uri,
  window,
  commands,
} from "vscode";
import { v4 as uuid } from "uuid";
import { PromiseAdapter, promiseFromEvent } from "./utils/promiseHandlers";
import axios from "axios";
import { TreeDataProvider } from "../../treeView";
import { SettingsManager } from "../../settings";
import {
  generateCodeVerifier,
  generateCodeChallengeFromVerifier,
  UriEventHandler,
  OAuthAccount,
  calculateTokenExpiryTime,
  SESSIONS_SECRET_KEY,
  ACCOUNT_SECRET_KEY,
  LoggedInUserInfo,
  getBaseUri,
} from "./utils/webUtils";
import {
  LightSpeedCommands,
  LIGHTSPEED_CLIENT_ID,
  LIGHTSPEED_SERVICE_LOGIN_TIMEOUT,
  LIGHTSPEED_ME_AUTH_URL,
} from "../../definitions/lightspeed";
import { LightspeedAuthSession } from "../../interfaces/lightspeed";
import { lightSpeedManager } from "../../extension";

const CODE_VERIFIER = generateCodeVerifier();
const CODE_CHALLENGE = generateCodeChallengeFromVerifier(CODE_VERIFIER);

// Grace time for sending request to refresh token
const GRACE_TIME = 10;

export class LightSpeedAuthenticationProvider
  implements AuthenticationProvider, Disposable
{
  public settingsManager: SettingsManager;
  private _sessionChangeEmitter =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: Disposable | undefined;
  private _uriHandler = new UriEventHandler();
  private _authId: string;
  private _authName: string;
  private _externalRedirectUri: string;

  constructor(
    private readonly context: ExtensionContext,
    settingsManager: SettingsManager,
    authId: string,
    authName: string,
    externalRedirectUri = ""
  ) {
    this.settingsManager = settingsManager;
    this._authId = authId;
    this._authName = authName;
    this._externalRedirectUri = externalRedirectUri;
  }

  public initialize() {
    if (this._disposable) {
      console.log(
        "[ansible-lightspeed-oauth] Auth provider already registered"
      );
      return;
    }

    this._disposable = Disposable.from(
      authentication.registerAuthenticationProvider(
        this._authId,
        this._authName,
        this,
        { supportsMultipleAccounts: false }
      ),
      window.registerUriHandler(this._uriHandler)
    );
  }

  async setExternalRedirectUri() {
    const callbackUri = await env.asExternalUri(Uri.parse(this.redirectUri));
    this._externalRedirectUri = callbackUri.toString(true);
  }

  get redirectUri() {
    const publisher = this.context.extension.packageJSON.publisher;
    const name = this.context.extension.packageJSON.name;

    return `${env.uriScheme}://${publisher}.${name}`;
  }

  get onDidChangeSessions() {
    return this._sessionChangeEmitter.event;
  }

  /**
   * Get the existing sessions
   * @param scopes
   * @returns
   */
  public async getSessions(): Promise<readonly LightspeedAuthSession[]> {
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);

    if (allSessions) {
      return JSON.parse(allSessions) as LightspeedAuthSession[];
    }

    return [];
  }

  /**
   * Create a new auth session
   * @param scopes
   * @returns
   */
  public async createSession(scopes: string[]): Promise<LightspeedAuthSession> {
    try {
      lightSpeedManager.currentModelValue = undefined;
      const account = await this.login(scopes);

      if (!account) {
        throw new Error(`Ansible Lightspeed login failure`);
      }

      const userinfo: LoggedInUserInfo = await this.getUserInfo(
        account.accessToken
      );

      const identifier = uuid();
      const userName = userinfo.external_username || userinfo.username || "";
      const rhOrgHasSubscription = userinfo.rh_org_has_subscription
        ? userinfo.rh_org_has_subscription
        : false;
      const rhUserHasSeat = userinfo.rh_user_has_seat
        ? userinfo.rh_user_has_seat
        : false;

      let label = userName;
      if (rhUserHasSeat) {
        label += " (licensed)";
      } else if (rhOrgHasSubscription) {
        label += " (no seat assigned)";
      } else {
        label += " (Tech Preview)";
      }
      const session: LightspeedAuthSession = {
        id: identifier,
        accessToken: account.accessToken,
        account: {
          label: label,
          id: identifier,
        },
        // scopes: account.scope,
        scopes: [],
        rhUserHasSeat: rhUserHasSeat,
        rhOrgHasSubscription: userinfo.rh_org_has_subscription
          ? userinfo.rh_org_has_subscription
          : false,
        rhUserIsOrgAdmin: userinfo.rh_user_is_org_admin
          ? userinfo.rh_user_is_org_admin
          : false,
      };
      await this.context.secrets.store(
        SESSIONS_SECRET_KEY,
        JSON.stringify([session])
      );

      this._sessionChangeEmitter.fire({
        added: [session],
        removed: [],
        changed: [],
      });

      lightSpeedManager.statusBarProvider.statusBar.text =
        await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText(
          rhUserHasSeat,
          rhOrgHasSubscription
        );

      lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip(
        session
      );

      console.log("[ansible-lightspeed-oauth] Session created...");

      return session;
    } catch (e) {
      console.error(
        `[ansible-lightspeed-oauth] Ansible Lightspeed sign in failed: ${e}`
      );
      throw e;
    }
  }

  /**
   * Remove an existing session
   * @param sessionId
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
        JSON.stringify(sessions)
      );

      if (session) {
        this._sessionChangeEmitter.fire({
          added: [],
          removed: [session],
          changed: [],
        });
        window.registerTreeDataProvider(
          "lightspeed-explorer-treeview",
          new TreeDataProvider(undefined)
        );
      }
    }
    lightSpeedManager.statusBarProvider.statusBar.text = "Lightspeed";
    lightSpeedManager.statusBarProvider.statusBar.tooltip = undefined;
    lightSpeedManager.currentModelValue = undefined;
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

      console.log("[ansible-lightspeed-oauth] Disposing auth provider");
      await this._disposable.dispose();
      this._disposable = undefined;
    }
  }

  /* Log in to the Ansible Lightspeed auth service */
  private async login(scopes: string[] = []) {
    console.log("[ansible-lightspeed-oauth] Logging in...");

    await this.setExternalRedirectUri();

    const searchParams = new URLSearchParams([
      ["response_type", "code"],
      ["code_challenge", CODE_CHALLENGE],
      ["code_challenge_method", "S256"],
      ["client_id", LIGHTSPEED_CLIENT_ID],
      ["redirect_uri", this._externalRedirectUri],
    ]);

    const base_uri = getBaseUri(this.settingsManager);
    if (!base_uri) {
      throw new Error(
        "Please enter the Ansible Lightspeed URL under the Ansible Lightspeed settings!"
      );
    }

    const query = searchParams.toString();
    const uri = Uri.parse(base_uri).with({ path: "/o/authorize/", query });

    const {
      promise: receivedRedirectUrl,
      cancel: cancelWaitingForRedirectUrl,
    } = promiseFromEvent(this._uriHandler.event, this.handleUriForCode(scopes));

    await env.openExternal(uri);

    const account = await window.withProgress(
      {
        title: "Waiting for authentication redirect from Ansible Lightspeed",
        location: ProgressLocation.Notification,
        cancellable: true,
      },
      async (_, token) =>
        Promise.race([
          receivedRedirectUrl,
          new Promise<OAuthAccount>((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Cancelling the Ansible Lightspeed login after 60s. Try again."
                  )
                ),
              LIGHTSPEED_SERVICE_LOGIN_TIMEOUT
            );
          }),
          promiseFromEvent<any, any>(
            token.onCancellationRequested,
            (_, __, reject) => {
              reject("User Cancelled");
            }
          ).promise,
        ]).finally(() => {
          cancelWaitingForRedirectUrl.fire();
        })
    );

    return account;
  }

  /* Handle the redirect to VS Code (after sign in from the Ansible Lightspeed auth service) */
  private handleUriForCode: (
    scopes: readonly string[]
  ) => PromiseAdapter<Uri, OAuthAccount> =
    () => async (uri, resolve, reject) => {
      const query = new URLSearchParams(uri.query);
      const code = query.get("code");

      if (!code) {
        reject(
          new Error("No code received from the Ansible Lightspeed OAuth Server")
        );
        return;
      }

      const account = await this.requestOAuthAccountFromCode(code);

      if (!account) {
        reject(new Error("Unable to form account"));
        return;
      }

      resolve(account);
    };

  /* Request access token from server using code */
  private async requestOAuthAccountFromCode(
    code: string
  ): Promise<OAuthAccount | undefined> {
    const headers = {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const postData = {
      client_id: LIGHTSPEED_CLIENT_ID,
      code: code,
      code_verifier: CODE_VERIFIER,
      redirect_uri: this._externalRedirectUri,
      grant_type: "authorization_code",
    };

    console.log(
      "[ansible-lightspeed-oauth] Sending request for access token..."
    );

    try {
      const { data } = await axios.post(
        `${getBaseUri(this.settingsManager)}/o/token/`,
        postData,
        {
          headers: headers,
        }
      );

      const account: OAuthAccount = {
        type: "oauth",
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAtTimestampInSeconds: calculateTokenExpiryTime(data.expires_in),
        // scope: data.scope,
      };
      // store the account info
      this.context.secrets.store(ACCOUNT_SECRET_KEY, JSON.stringify(account));

      return account;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "[ansible-lightspeed-oauth] error message: ",
          error.message
        );
        throw new Error("An unexpected error occurred");
      } else {
        console.error("[ansible-lightspeed-oauth] unexpected error: ", error);
        throw new Error("An unexpected error occurred");
      }
    }
  }

  /* Request new access token using refresh token */
  private async requestTokenAfterExpiry(
    currentAccount: OAuthAccount
  ): Promise<OAuthAccount | undefined> {
    const headers = {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const postData = {
      client_id: LIGHTSPEED_CLIENT_ID,
      refresh_token: currentAccount.refreshToken,
      grant_type: "refresh_token",
    };

    console.log(
      "[ansible-lightspeed-oauth] Sending request for a new access token..."
    );

    const account = await window.withProgress(
      {
        title: "Refreshing token",
        location: ProgressLocation.Notification,
      },
      async () => {
        return axios
          .post(`${getBaseUri(this.settingsManager)}/o/token/`, postData, {
            headers: headers,
          })
          .then((response) => {
            const data = response.data;
            const account: OAuthAccount = {
              ...currentAccount,
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAtTimestampInSeconds: calculateTokenExpiryTime(
                data.expires_in
              ),
              // scope: data.scope,
            };

            // store the account info
            this.context.secrets.store(
              ACCOUNT_SECRET_KEY,
              JSON.stringify(account)
            );

            return account;
          })
          .catch((error) => {
            console.error(
              `[ansible-lightspeed-oauth] Request token failed with error: ${error}`
            );
            return;
          });
      }
    );

    return account ? (account as OAuthAccount) : undefined;
  }

  /**
   * Method that returns access token to be used in API calls
   * The method also checks if the token is expired or not, if so,
   * it requests for a new token and updates the secret store
   */
  public async grantAccessToken() {
    console.log("[ansible-lightspeed-oauth] Granting access token...");

    if (process.env.TEST_LIGHTSPEED_ACCESS_TOKEN) {
      console.log("[oauth] Test access token returned");
      return process.env.TEST_LIGHTSPEED_ACCESS_TOKEN;
    }

    // check if the user is authenticated or not
    const session = await this.isAuthenticated();

    if (!session) {
      console.log("[ansible-lightspeed-oauth] Session not found. Returning...");
      const selection = await window.showWarningMessage(
        "You must be logged in to use the Ansible Lightspeed.\n",
        "Login"
      );
      if (selection === "Login") {
        commands.executeCommand(LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST);
      }
      return;
    }

    console.log("[ansible-lightspeed-oauth] Session found");

    const sessionId = session.id;

    const account = await this.context.secrets.get(ACCOUNT_SECRET_KEY);
    if (!account) {
      throw new Error(`Unable to fetch account`);
    }

    console.log("[ansible-lightspeed-oauth] Account found");

    const currentAccount: OAuthAccount = JSON.parse(account);
    let tokenToBeReturned = currentAccount.accessToken;

    // check if token needs to be refreshed
    const timeNow = Math.floor(new Date().getTime() / 1000);
    if (timeNow >= currentAccount["expiresAtTimestampInSeconds"] - GRACE_TIME) {
      // get new token
      console.log(
        "[ansible-lightspeed-oauth] Ansible Lightspeed token expired. Getting new token..."
      );

      const result = await this.requestTokenAfterExpiry(currentAccount);
      console.log(
        "[ansible-lightspeed-oauth] New Ansible Lightspeed token received."
      );

      if (!result) {
        window.showErrorMessage(
          "Failed to refresh token. Please log out and log in again"
        );
        return;
      }

      const newAccount: OAuthAccount = result;

      await this.context.secrets.store(
        ACCOUNT_SECRET_KEY,
        JSON.stringify(newAccount)
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
          JSON.stringify(sessions)
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

  public async getLightSpeedAuthSession(): Promise<
    LightspeedAuthSession | undefined
  > {
    let lightSpeedAuthSession = undefined;
    const session = await this.isAuthenticated();
    // change the session id of the existing session
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
    if (allSessions) {
      const lightspeedSessions = JSON.parse(
        allSessions
      ) as LightspeedAuthSession[];
      const sessionIdx = lightspeedSessions.findIndex(
        (s) => s.id === session?.id
      );
      lightSpeedAuthSession = lightspeedSessions[sessionIdx];
    }
    return lightSpeedAuthSession;
  }

  /* Get the user info from server */
  private async getUserInfo(token: string) {
    console.log(
      "[ansible-lightspeed-oauth] Sending request for logged-in user info..."
    );

    try {
      const { data } = await axios.get(
        `${getBaseUri(this.settingsManager)}${LIGHTSPEED_ME_AUTH_URL}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "[ansible-lightspeed-oauth] error message: ",
          error.message
        );
        throw new Error(error.message);
      } else {
        console.error("[ansible-lightspeed-oauth] unexpected error: ", error);
        throw new Error("An unexpected error occurred");
      }
    }
  }

  /* Return session info if user is authenticated, else undefined */
  public async isAuthenticated(): Promise<AuthenticationSession | undefined> {
    // check if the user is authenticated
    const userAuth = await authentication.getSession(this._authId, [], {
      createIfNone: false,
    });

    return userAuth;
  }

  public async rhUserHasSeat(): Promise<boolean | undefined> {
    const authSession = await this.getLightSpeedAuthSession();
    if (authSession === undefined) {
      console.log(
        "[ansible-lightspeed-oauth] User authentication session not found."
      );
      return undefined;
    } else if (authSession?.rhUserHasSeat) {
      console.log(
        `[ansible-lightspeed-oauth] User "${authSession?.account?.label}" has a seat.`
      );
      return true;
    } else {
      console.log(
        `[ansible-lightspeed-oauth] User "${authSession?.account?.label}" does not have a seat.`
      );
      return false;
    }
  }

  public async rhOrgHasSubscription(): Promise<boolean | undefined> {
    const authSession = await this.getLightSpeedAuthSession();
    if (authSession === undefined) {
      console.log(
        "[ansible-lightspeed-oauth] User authentication session not found."
      );
      return undefined;
    } else if (authSession?.rhOrgHasSubscription) {
      console.log(
        `[ansible-lightspeed-oauth] User "${authSession?.account?.label}" has an Org with a subscription.`
      );
      return true;
    } else {
      console.log(
        `[ansible-lightspeed-oauth] User "${authSession?.account?.label}" does not have an Org with a subscription.`
      );
      return false;
    }
  }
}
