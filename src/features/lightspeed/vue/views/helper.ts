import type { Disposable, ExtensionContext, Webview } from "vscode";
import { getWebviewHtml } from "@src/webviewHtml";
import { WebviewMessageHandlers } from "@src/features/lightspeed/vue/views/webviewMessageHandlers";

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
