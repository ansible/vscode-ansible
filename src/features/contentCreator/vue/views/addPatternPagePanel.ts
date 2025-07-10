import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn } from "vscode";
import {
  setupPanelLifecycle,
  disposePanelResources,
  createOrRevealPanel,
} from "./panelUtils";
import { checkContentCreatorRequirements } from "../../utils";

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    setupPanelLifecycle(
      this._panel,
      context,
      "add-pattern",
      this._disposables,
      () => this.dispose(),
    );

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg && msg.type === "request-requirements-status") {
          const status = await checkContentCreatorRequirements();
          this._panel.webview.postMessage({
            type: "requirements-status",
            ...status,
          });
        }
      },
      null,
      this._disposables,
    );
  }

  public static render(context: ExtensionContext) {
    createOrRevealPanel({
      viewType: "AddPattern",
      viewTitle: "Add Pattern",
      viewColumn: ViewColumn.One,
      context: context,
      getCurrentPanel: () => MainPanel.currentPanel,
      setCurrentPanel: (panel) => {
        MainPanel.currentPanel = panel;
      },
      getPanel: (instance) => instance._panel,
      panelConstructor: (panel, context) => new MainPanel(panel, context),
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
