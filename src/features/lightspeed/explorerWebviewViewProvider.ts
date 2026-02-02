import type {
  CancellationToken,
  Disposable,
  ExtensionContext,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import { WebviewHelper } from "@/features/lightspeed/vue/views/helper";

export class LightspeedExplorerWebviewViewProvider implements WebviewViewProvider {
  public static readonly viewType = "lightspeed-explorer-webview";

  private disposables: Disposable[] = [];
  private context: ExtensionContext;
  private _view?: WebviewView;

  constructor(context: ExtensionContext) {
    this.context = context;
  }

  public async resolveWebviewView(
    webviewView: WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _resolveContext: WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
    };

    // Setup HTML content using the Vue-based explorer
    webviewView.webview.html = WebviewHelper.setupHtml(
      webviewView.webview,
      this.context,
      "explorer",
    );

    // Setup message handlers
    await WebviewHelper.setupWebviewHooks(
      webviewView.webview,
      this.disposables,
      this.context,
    );

    // Cleanup disposables when the view is disposed
    webviewView.onDidDispose(() => {
      while (this.disposables.length) {
        const disposable = this.disposables.pop();
        if (disposable) {
          disposable.dispose();
        }
      }
    });
  }
  public refreshWebView() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "userRefreshExplorerState",
        data: {},
      });
    }
  }
}
