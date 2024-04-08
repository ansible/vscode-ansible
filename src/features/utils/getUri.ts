import { Uri, Webview } from "vscode";

/**
 * A helper function which will get the webview URI of a given file or resource.
 *
 * @remarks This URI can be used within a webview's HTML as a link to the
 * given file/resource.
 */
export function getUri(
  webview: Webview,
  extensionUri: Uri,
  pathList: string[],
) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}
