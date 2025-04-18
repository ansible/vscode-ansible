import * as vscode from "vscode";
import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window } from "vscode";
import { WebviewHelper } from "./helper";
import { GenerationListEntry } from "../../../../interfaces/lightspeed";

export type Playbook = {
  content: string;
  fileName: string;
};

export type Role = {
  files: GenerationListEntry[];
  roleName: string;
};

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    const html = WebviewHelper.setupHtml(
      this._panel.webview,
      context,
      "explanation",
    );

    const codiconCssHref = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media/codicons/codicon.css"),
    );

    this._panel.webview.html = html.replace(
      "{{codiconsStyleSheet}}",
      `<link rel="stylesheet" href="${codiconCssHref.toString()}" id="vscode-codicon-stylesheet"/>`,
    );

    WebviewHelper.setupWebviewHooks(
      this._panel.webview,
      this._disposables,
      context,
    );
  }

  public static render(
    context: ExtensionContext,
    type: "playbook" | "role",
    data: Playbook | Role,
  ) {
    const panel = window.createWebviewPanel(
      "Explanation",
      "Explanation",
      ViewColumn.Beside,
      {
        enableScripts: true,
        enableCommandUris: true,
        retainContextWhenHidden: true,
      },
    );

    MainPanel.currentPanel = new MainPanel(panel, context);

    if (type === "playbook") {
      panel.webview.postMessage({
        type: "setPlaybookData",
        data,
      });
    }

    if (type === "role") {
      panel.webview.postMessage({
        type: "setRoleData",
        data,
      });
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
