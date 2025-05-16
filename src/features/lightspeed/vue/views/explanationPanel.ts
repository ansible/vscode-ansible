import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window } from "vscode";
import { GenerationListEntry } from "../../../../interfaces/lightspeed";
import { setupPanelLifecycle, disposePanelResources } from "./panelUtils";

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
    setupPanelLifecycle(
      this._panel,
      context,
      "explanation",
      this._disposables,
      () => this.dispose(),
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

    MainPanel.postMessage(panel, type, data);
  }

  private static postMessage(
    panel: WebviewPanel,
    type: "playbook" | "role",
    data: Playbook | Role,
  ) {
    const messageType = type === "playbook" ? "setPlaybookData" : "setRoleData";
    panel.webview.postMessage({
      type: messageType,
      data,
    });
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    MainPanel.currentPanel = undefined;
    disposePanelResources(this._panel, this._disposables);
  }
}
