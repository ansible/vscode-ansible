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
 * Reads the built HTML file for a webview, injects a CSP meta tag with a
 * fresh nonce, and rewrites asset paths to use webview URIs.
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, context, inputName = "index" } = options;
  const nonce = crypto.randomBytes(16).toString("base64");

  const distDir = path.join(context.extensionPath, "dist");
  const htmlPath = findHtmlFile(distDir, inputName);
  let html = fs.readFileSync(htmlPath, "utf8");

  const baseUri = webview.asWebviewUri(
    Uri.joinPath(context.extensionUri, "dist"),
  );

  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src 'self' ${webview.cspSource} https: data:;">`;

  // Inject CSP into <head>
  html = html.replace("<head>", `<head>\n    ${csp}`);

  // Add nonce to all <script> tags
  html = html.replace(/<script /g, `<script nonce="${nonce}" `);

  // Rewrite absolute /assets/ paths to webview URIs
  html = html.replace(/(href|src)="\/assets\//g, `$1="${baseUri}/assets/`);

  return html;
}
