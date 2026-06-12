import type { Disposable, ExtensionContext, Webview } from "vscode";
import { getWebviewHtml } from "@src/webviewHtml";
import {
  WebviewMessageHandlers,
  WebviewMessage,
} from "@src/features/lightspeed/vue/views/webviewMessageHandlers";

function setupHtml(webview: Webview, context: ExtensionContext, name: string) {
  return getWebviewHtml({ webview, context, inputName: name });
}

async function setupWebviewHooks(
  webview: Webview,
  disposables: Disposable[],
  context: ExtensionContext,
) {
  const messageHandlers = new WebviewMessageHandlers();

  webview.onDidReceiveMessage(
    async (message: WebviewMessage) => {
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
