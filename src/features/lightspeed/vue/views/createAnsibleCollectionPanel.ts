import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import * as os from "os";
import { ViewColumn } from "vscode";
import {
  setupPanelLifecycle,
  disposePanelResources,
  createOrRevealPanel,
} from "./lightspeedPanelUtils";

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, context: ExtensionContext) {
    this._panel = panel;
    setupPanelLifecycle(
      this._panel,
      context,
      "create-ansible-collection",
      this._disposables,
      () => this.dispose(),
    );

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === "ui-mounted") {
          this._panel.webview.postMessage({
            command: "homedirAndTempdir",
            homedir: os.homedir(),
            tempdir: os.tmpdir(),
          });
        }
      },
      null,
      this._disposables,
    );
  }

  public static render(context: ExtensionContext) {
    createOrRevealPanel({
      viewType: "createAnsibleCollection",
      viewTitle: "Create Ansible Collection",
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
