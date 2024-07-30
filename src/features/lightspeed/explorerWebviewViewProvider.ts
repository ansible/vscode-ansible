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
import { LightspeedUser } from "./lightspeedUser";

import { isPlaybook } from "./playbookExplanation";

export class LightspeedExplorerWebviewViewProvider
  implements WebviewViewProvider
{
  public static readonly viewType = "lightspeed-explorer-webview";

  //sessionInfo: LightspeedSessionInfo = {};
  //sessionData: LightspeedAuthSession = {} as LightspeedAuthSession;
  private lightspeedAuthenticatedUser: LightspeedUser;
  public webviewView: WebviewView | undefined;
  public lightspeedExperimentalEnabled: boolean = false;

  constructor(
    private readonly _extensionUri: Uri,
    lightspeedAuthenticatedUser: LightspeedUser,
  ) {
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
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
    const content =
      await this.lightspeedAuthenticatedUser.getLightspeedUserContent();

    if (content) {
      return getWebviewContentWithActiveSession(
        webview,
        extensionUri,
        String(content),
        this.hasPlaybookOpened(),
      );
    } else {
      return getWebviewContentWithLoginForm(webview, extensionUri);
    }
  }

  private hasPlaybookOpened() {
    const document = window.activeTextEditor?.document;
    if (document !== undefined && document.languageId === "ansible") {
      try {
        return isPlaybook(document.getText());
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  private async _setWebviewMessageListener(webview: Webview) {
    await setWebviewMessageListener(webview, []);
  }
}
