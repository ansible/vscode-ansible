import type {
  CancellationToken,
  Disposable,
  ExtensionContext,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from "vscode";
import { WebviewHelper } from "@/features/lightspeed/vue/views/helper";

export class LightspeedFeedbackWebviewViewProvider implements WebviewViewProvider {
  public static readonly viewType = "lightspeed-feedback-webview";

  private disposables: Disposable[] = [];
  private context: ExtensionContext;

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
    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
    };

    // Setup HTML content using the Vue-based feedback webview
    webviewView.webview.html = WebviewHelper.setupHtml(
      webviewView.webview,
      this.context,
      "feedback",
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
}
