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
import { SettingsManager } from "../../settings";
import { getLightspeedLogger, Log } from "../../utils/logger";

import { isPlaybook, isDocumentInRole } from "./utils/explanationUtils";

export class LightspeedExplorerWebviewViewProvider
  implements WebviewViewProvider
{
  public static readonly viewType = "lightspeed-explorer-webview";

  //sessionInfo: LightspeedSessionInfo = {};
  //sessionData: LightspeedAuthSession = {} as LightspeedAuthSession;
  private lightspeedAuthenticatedUser: LightspeedUser;
  private settingsManager: SettingsManager;
  private logger: Log;
  public webviewView: WebviewView | undefined;
  public lightspeedExperimentalEnabled: boolean = false;

  constructor(
    private readonly _extensionUri: Uri,
    lightspeedAuthenticatedUser: LightspeedUser,
    settingsManager: SettingsManager,
  ) {
    this.lightspeedAuthenticatedUser = lightspeedAuthenticatedUser;
    this.settingsManager = settingsManager;
    this.logger = getLightspeedLogger(); // Use singleton logger
  }

  public async refreshWebView() {
    if (!this.webviewView) {
      return;
    }
    const newContent = await this._getWebviewContent(
      this.webviewView.webview,
      this._extensionUri,
    );
    this.webviewView.webview.html = newContent;
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
    await this.refreshWebView();

    this._setWebviewMessageListener(webviewView.webview);
  }

  private async _getWebviewContent(webview: Webview, extensionUri: Uri) {
    const provider = this.settingsManager.settings.lightSpeedService.provider;

    // For LLM providers (not WCA), skip OAuth check and show active session
    if (provider && provider !== "wca") {
      return getWebviewContentWithActiveSession(
        webview,
        extensionUri,
        `Using ${provider} provider`, // Provider-specific message
        this.hasPlaybookOpened(),
        await this.hasRoleOpened(),
      );
    }

    // For WCA, check OAuth session
    const content =
      await this.lightspeedAuthenticatedUser.getLightspeedUserContent();

    if (content) {
      return getWebviewContentWithActiveSession(
        webview,
        extensionUri,
        content,
        this.hasPlaybookOpened(),
        await this.hasRoleOpened(),
      );
    } else {
      this.logger.info(
        `[Lightspeed Explorer] No OAuth session, showing login form`,
      );
      return getWebviewContentWithLoginForm(webview, extensionUri);
    }
  }

  private hasPlaybookOpened() {
    const document = window.activeTextEditor?.document;
    if (document !== undefined && document.languageId === "ansible") {
      try {
        return isPlaybook(document.getText());
      } catch {
        return false;
      }
    }
    return false;
  }

  private async hasRoleOpened() {
    const document = window.activeTextEditor?.document;
    if (document !== undefined) {
      try {
        return await isDocumentInRole(document);
      } catch {
        return false;
      }
    }
    return false;
  }

  private async _setWebviewMessageListener(webview: Webview) {
    await setWebviewMessageListener(webview, []);
  }
}
