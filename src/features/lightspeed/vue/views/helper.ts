import type { Disposable, ExtensionContext, Webview } from "vscode";
import { getWebviewHtml } from "virtual:vscode";
import { WebviewMessageHandlers } from "./webviewMessageHandlers";

// Re-export commonly used functions for backward compatibility
export { getCollectionsFromWorkspace } from "./fileOperations";

export function setupHtml(
  webview: Webview,
  context: ExtensionContext,
  name: string,
) {
  return getWebviewHtml({
    // vite dev mode
    serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/lightspeed/${name}.html`,
    // vite prod mode
    webview,
    context,
    inputName: name,
  });
}

export async function setupWebviewHooks(
  webview: Webview,
  disposables: Disposable[],
  context: ExtensionContext,
) {
  const messageHandlers = new WebviewMessageHandlers();

  webview.onDidReceiveMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (message: any) => {
      await messageHandlers.handleMessage(message, webview, context);
    },
    undefined,
    disposables,
  );
}

// Maintain backward compatibility by exporting as a namespace
export const WebviewHelper = {
  setupHtml,
  setupWebviewHooks,
};
