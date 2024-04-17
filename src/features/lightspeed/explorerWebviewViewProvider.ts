import {
  CancellationToken,
  Uri,
  window,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import {
  getWebviewContentWithLoginForm,
  getWebviewContentWithActiveSession,
  setWebviewMessageListener,
} from "./utils/explorerView";

import { getLoggedInSessionDetails } from "./utils/webUtils";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";

import { LightspeedAccessDenied, LightspeedNoLocalSession } from "./base";

export class LightspeedExplorerWebviewViewProvider
  implements WebviewViewProvider
{
  public static readonly viewType = "lightspeed-explorer-webview";
  private lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider;

  public webviewView: WebviewView | undefined;
  public lightspeedExperimentalEnabled: boolean = false;

  constructor(
    private readonly _extensionUri: Uri,
    lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider,
  ) {
    this.lightSpeedAuthenticationProvider = lightSpeedAuthenticationProvider;
  }

  public async refreshWebView() {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.html = await this._getWebviewContent(
      this.webviewView.webview,
      this._extensionUri,
    );
  }

  public async resolveWebviewView(
    webviewView: WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ) {
    // Allow scripts in the webview
    webviewView.webview.options = {
      // Enable JavaScript in the webview
      enableScripts: true,
      // Restrict the webview to only load resources from the `out` and `media` directory
      localResourceRoots: [
        Uri.joinPath(this._extensionUri, "out"),
        Uri.joinPath(this._extensionUri, "media"),
      ],
    };
    this.webviewView = webviewView;
    this.refreshWebView();

    this._setWebviewMessageListener(webviewView.webview);
  }

  private async _getWebviewContent(webview: Webview, extensionUri: Uri) {
    if (!this.lightSpeedAuthenticationProvider.userIsConnected) {
      return getWebviewContentWithLoginForm(webview, extensionUri);
    }

    try {
      const session =
        await this.lightSpeedAuthenticationProvider.getLightSpeedAuthSession();
      //this.lightSpeedAuthProvider.getUserInfo(session.accessToken);
      const sessionInfo = getLoggedInSessionDetails(session);
      const userName = session.account.label;
      const userType = sessionInfo.userInfo?.userType || "";
      const userRole =
        sessionInfo.userInfo?.role !== undefined
          ? sessionInfo.userInfo?.role
          : "";
      return getWebviewContentWithActiveSession(
        webview,
        extensionUri,
        userName,
        userType,
        userRole,
        window.activeTextEditor?.document.languageId === "ansible",
        this.lightspeedExperimentalEnabled,
      );
    } catch (error) {
      if (error instanceof LightspeedAccessDenied) {
        return getWebviewContentWithLoginForm(webview, extensionUri);
      } else if (error instanceof LightspeedNoLocalSession) {
        return getWebviewContentWithLoginForm(webview, extensionUri);
      }
    }
    return getWebviewContentWithLoginForm(webview, extensionUri);
  }

  private async _setWebviewMessageListener(webview: Webview) {
    await setWebviewMessageListener(webview, []);
  }
}
