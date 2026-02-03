import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window } from "vscode";
import { WebviewHelper } from "@/features/lightspeed/vue/views/helper";

export class LightspeedFeedbackWebviewProvider {
  public static currentPanel: LightspeedFeedbackWebviewProvider | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private _context: ExtensionContext;

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.onDidDispose(
      () => {
        this.dispose();
      },
      null,
      this._disposables,
    );

    // Set the HTML content for the webview panel using Vue-based feedback
    this._panel.webview.html = WebviewHelper.setupHtml(
      this._panel.webview,
      this._context,
      "feedback",
    );

    // Set up message handlers
    WebviewHelper.setupWebviewHooks(
      this._panel.webview,
      this._disposables,
      this._context,
    );
  }

  public static render(context: ExtensionContext) {
    if (LightspeedFeedbackWebviewProvider.currentPanel) {
      // If the webview panel already exists reveal it
      LightspeedFeedbackWebviewProvider.currentPanel._panel.reveal(
        ViewColumn.One,
      );
    } else {
      // If a webview panel does not already exist create and show a new one
      const panel = window.createWebviewPanel(
        "ansibleLightSpeedFeedback",
        "Ansible Lightspeed Feedback",
        ViewColumn.One,
        {
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
        },
      );

      LightspeedFeedbackWebviewProvider.currentPanel =
        new LightspeedFeedbackWebviewProvider(panel, context);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    LightspeedFeedbackWebviewProvider.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) associated with the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
