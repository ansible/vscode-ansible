import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window } from "vscode";
import { WebviewHelper } from "./helper";

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = WebviewHelper.setupHtml(
      this._panel.webview,
      context,
    );

    WebviewHelper.setupWebviewHooks(this._panel.webview, this._disposables);
  }

  public static render(context: ExtensionContext) {
    if (MainPanel.currentPanel) {
      MainPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      const panel = window.createWebviewPanel(
        "roleGeneration",
        "Role Generation",
        ViewColumn.One,
        {
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
        },
      );

      MainPanel.currentPanel = new MainPanel(panel, context);
    }
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    MainPanel.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) for the current webview panel
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
