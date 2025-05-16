import type { Disposable, ExtensionContext, WebviewPanel } from "vscode";
import { ViewColumn, window } from "vscode";
import { WebviewHelper } from "./helper";

/**
 * Sets up the common lifecycle hooks and HTML content for a webview panel.
 */
export function setupPanelLifecycle(
  panel: WebviewPanel,
  context: ExtensionContext,
  htmlEntryPoint: string,
  disposables: Disposable[],
  disposeCallback: () => void,
): void {
  panel.onDidDispose(disposeCallback, null, disposables);
  panel.webview.html = WebviewHelper.setupHtml(
    panel.webview,
    context,
    htmlEntryPoint,
  );
  WebviewHelper.setupWebviewHooks(panel.webview, disposables, context);
}

/**
 * Disposes of the panel and its associated disposables.
 */
export function disposePanelResources(
  panel: WebviewPanel,
  disposables: Disposable[],
): void {
  panel.dispose();
  while (disposables.length) {
    const disposable = disposables.pop();
    if (disposable) {
      disposable.dispose();
    }
  }
}

/**
 * Options for creating or revealing a panel.
 */
interface CreateOrRevealPanelOptions<T> {
  viewType: string;
  viewTitle: string;
  viewColumn: ViewColumn;
  context: ExtensionContext;
  panelConstructor: (panel: WebviewPanel, context: ExtensionContext) => T;
  getCurrentPanel: () => T | undefined;
  setCurrentPanel: (panel: T | undefined) => void;
  getPanel: (panelInstance: T) => WebviewPanel;
}

/**
 * Creates a new webview panel or reveals the existing one.
 * Used for panels that should only have one instance active.
 */
export function createOrRevealPanel<T>(
  options: CreateOrRevealPanelOptions<T>,
): void {
  const currentPanelInstance = options.getCurrentPanel();
  if (currentPanelInstance) {
    options.getPanel(currentPanelInstance).reveal(options.viewColumn);
  } else {
    const panel = window.createWebviewPanel(
      options.viewType,
      options.viewTitle,
      options.viewColumn,
      {
        enableScripts: true,
        enableCommandUris: true,
        retainContextWhenHidden: true,
      },
    );
    const newPanelInstance = options.panelConstructor(panel, options.context);
    options.setCurrentPanel(newPanelInstance);
  }
}
