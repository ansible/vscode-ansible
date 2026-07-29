/**
 * Build the HTML shell for the Ansible NavTree webview (CSP + React entry).
 * @param options - Resolved webview resource URIs and CSP nonce
 * @param options.scriptUri - Webview URI for `dist/webview.js`
 * @param options.codiconsUri - Webview URI for codicon.css
 * @param options.nonce - CSP nonce for the script tag
 * @param options.cspSource - Webview CSP source token
 * @returns Document HTML
 */
export function buildSidebarNavTreeHtml(options: {
    scriptUri: string;
    codiconsUri: string;
    nonce: string;
    cspSource: string;
}): string {
    const { scriptUri, codiconsUri, nonce, cspSource } = options;
    const csp = [
        `default-src 'none'`,
        `style-src ${cspSource} 'unsafe-inline'`,
        `font-src ${cspSource}`,
        `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${codiconsUri}" rel="stylesheet" />
  <style>
    html, body, #root { height: 100%; margin: 0; padding: 0; }
    body {
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="root" data-view="sidebar-navtree" data-props="{}"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
