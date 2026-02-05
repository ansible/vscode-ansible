import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, Uri, window } from "vscode";
import { disposePanelResources } from "./panelUtils";
import {
  LlmProviderMessageHandlers,
  LlmProviderDependencies,
} from "./llmProviderMessageHandlers";
import { providerFactory } from "../../providers/factory";

/**
 * Main panel for LLM Provider settings.
 * Opens as a full webview panel in the editor area.
 */
export class LlmProviderPanel {
  public static currentPanel: LlmProviderPanel | undefined;
  private readonly _panel: WebviewPanel;
  private _disposables: Disposable[] = [];
  private readonly messageHandlers: LlmProviderMessageHandlers;

  /**
   * Get panel title based on active provider.
   */
  private static getPanelTitle(deps: LlmProviderDependencies): string {
    const activeProviderType =
      deps.settingsManager.settings.lightSpeedService.provider;

    if (!activeProviderType) {
      return "Configure LLM Provider";
    }

    const providerInfo = providerFactory
      .getSupportedProviders()
      .find((p) => p.type === activeProviderType);

    if (providerInfo) {
      return `LLM Provider: ${providerInfo.displayName}`;
    }

    return "Configure LLM Provider";
  }

  private constructor(
    panel: WebviewPanel,
    context: ExtensionContext,
    deps: LlmProviderDependencies,
  ) {
    this._panel = panel;
    this.messageHandlers = new LlmProviderMessageHandlers(deps);

    // Set up panel lifecycle
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Set the HTML content
    this._panel.webview.html = this._getWebviewContent(context);

    // Set up message handler
    this.messageHandlers.setWebview(this._panel.webview);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.messageHandlers.handleMessage(message);
      },
      undefined,
      this._disposables,
    );

    // Send initial settings
    this.messageHandlers.sendProviderSettings();
  }

  /**
   * Renders the LLM Provider panel or reveals it if already open.
   */
  public static render(
    context: ExtensionContext,
    deps: LlmProviderDependencies,
  ) {
    if (LlmProviderPanel.currentPanel) {
      LlmProviderPanel.currentPanel._panel.reveal(ViewColumn.One);
    } else {
      const panelTitle = LlmProviderPanel.getPanelTitle(deps);
      const panel = window.createWebviewPanel(
        "llm-provider-settings",
        panelTitle,
        ViewColumn.One,
        {
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            Uri.joinPath(context.extensionUri, "out"),
            Uri.joinPath(context.extensionUri, "media"),
          ],
        },
      );

      LlmProviderPanel.currentPanel = new LlmProviderPanel(panel, context, deps);
    }
  }

  /**
   * Refreshes the webview with updated settings.
   */
  public async refreshWebView() {
    await this.messageHandlers.sendProviderSettings();
  }

  private _getWebviewContent(context: ExtensionContext): string {
    return __getWebviewHtml__({
      serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/llm-provider.html`,
      webview: this._panel.webview,
      context,
      inputName: "llm-provider",
    });
  }

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose() {
    LlmProviderPanel.currentPanel = undefined;
    disposePanelResources(this._panel, this._disposables);
  }
}
