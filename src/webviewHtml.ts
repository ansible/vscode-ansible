import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { type ExtensionContext, type Webview, Uri } from "vscode";

interface WebviewHtmlOptions {
  webview: Webview;
  context: ExtensionContext;
  inputName?: string;
}

function findHtmlFile(distDir: string, inputName: string): string {
  const filename = `${inputName}.html`;
  // Walk dist/ recursively to find the matching HTML file
  function search(dir: string): string | undefined {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = search(path.join(dir, entry.name));
        if (found) return found;
      } else if (entry.name === filename) {
        return path.join(dir, entry.name);
      }
    }
    return undefined;
  }
  const found = search(distDir);
  if (!found) {
    throw new Error(`Webview HTML file not found: ${filename} in ${distDir}`);
  }
  return found;
}

/**
 * Returns the Vite dev server URL if the dev server is running, or undefined
 * for production builds. The dev server writes its URL to a marker file.
 */
function getDevServerUrl(extensionPath: string): string | undefined {
  const markerPath = path.join(extensionPath, ".vite-dev-server-url");
  try {
    return fs.readFileSync(markerPath, "utf8").trim();
  } catch {
    return undefined;
  }
}

/**
 * Resolves the entry script path on the Vite dev server for a given input name.
 * Matches the multi-page input structure in vite.config.mts.
 */
function resolveDevEntryScript(inputName: string): string {
  const lightspeedPages = [
    "explanation",
    "explorer",
    "hello-world",
    "playbook-generation",
    "role-generation",
  ];
  if (lightspeedPages.includes(inputName)) {
    return `webviews/lightspeed/src/${inputName}.ts`;
  }
  return `webviews/${inputName}.ts`;
}

/**
 * Reads the built HTML file for a webview, injects a CSP meta tag with a
 * fresh nonce, and rewrites asset paths to use webview URIs.
 *
 * In dev mode (Vite dev server running), returns an HTML shell that loads
 * directly from the dev server, enabling HMR.
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, context, inputName = "index" } = options;
  const nonce = crypto.randomBytes(16).toString("base64");

  const devServerUrl = getDevServerUrl(context.extensionPath);
  if (devServerUrl) {
    const entryScript = resolveDevEntryScript(inputName);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' http://localhost:*; style-src ${webview.cspSource} 'unsafe-inline' http://localhost:*; font-src ${webview.cspSource} http://localhost:*; img-src 'self' ${webview.cspSource} https: data: http://localhost:*; connect-src ws://localhost:* http://localhost:*;">
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" type="module" src="${devServerUrl}/@vite/client"></script>
    <script nonce="${nonce}" type="module" src="${devServerUrl}/${entryScript}"></script>
  </body>
</html>`;
  }

  const distDir = path.join(context.extensionPath, "dist");
  const htmlPath = findHtmlFile(distDir, inputName);
  let html = fs.readFileSync(htmlPath, "utf8");

  const baseUri = webview.asWebviewUri(
    Uri.joinPath(context.extensionUri, "dist"),
  );

  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src 'self' ${webview.cspSource} https: data:;">`;

  // Inject CSP into <head>
  html = html.replace("<head>", `<head>\n    ${csp}`);

  // Add nonce to all <script> tags
  html = html.replace(/<script /g, `<script nonce="${nonce}" `);

  // Rewrite absolute /assets/ paths to webview URIs
  html = html.replace(/(href|src)="\/assets\//g, `$1="${baseUri}/assets/`);

  return html;
}
