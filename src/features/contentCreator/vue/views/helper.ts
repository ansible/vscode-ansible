import type { Disposable, ExtensionContext, Webview } from "vscode";
import { WebviewMessageHandlers } from "../../../lightspeed/vue/views/webviewMessageHandlers";

export function setupHtml(
  webview: Webview,
  context: ExtensionContext,
  name: string,
) {
  return __getWebviewHtml__({
    // vite dev mode
    serverUrl: `${process.env.VITE_DEV_SERVER_URL}webviews/${name}.html`,
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

// Export as a namespace for consistency
export const ContentCreatorWebviewHelper = {
  setupHtml,
  setupWebviewHooks,
};
