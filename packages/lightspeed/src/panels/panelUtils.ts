import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

export function getNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}

export function getWebviewHtml(
    extensionUri: vscode.Uri,
    webview: vscode.Webview,
    entryPoint: string,
): string {
    const distBase = vscode.Uri.joinPath(extensionUri, 'packages', 'lightspeed', 'dist', 'webviews');
    const htmlFile = findHtmlFile(distBase.fsPath, `${entryPoint}.html`);

    if (!htmlFile) {
        return `<html><body><h2>Webview not found</h2><p>Could not find ${entryPoint}.html in dist/webviews/. Run <code>npm run build:webviews -w packages/lightspeed</code>.</p></body></html>`;
    }

    let html = fs.readFileSync(htmlFile, 'utf8');
    const nonce = getNonce();

    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(distBase, 'assets'));

    html = html.replace(/(href|src)="\.\.\/assets\//g, `$1="${assetUri.toString()}/`);

    html = html.replace(/ crossorigin/g, '');

    html = html.replace(/<script /g, `<script nonce="${nonce}" `);

    html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} https: data:`,
        `script-src 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `connect-src ${webview.cspSource} https:`,
    ].join('; ');

    html = html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );

    return html;
}

function findHtmlFile(dir: string, name: string): string | undefined {
    if (!fs.existsSync(dir)) return undefined;

    const direct = path.join(dir, name);
    if (fs.existsSync(direct)) return direct;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const found = findHtmlFile(path.join(dir, entry.name), name);
            if (found) return found;
        }
    }
    return undefined;
}
