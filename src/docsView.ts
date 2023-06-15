
import * as vscode from "vscode";

export class DocsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'lightspeed-explorer-webview';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			//enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};
	}

	public async setHTMLDoc(sHTML: string) {
		if (!this._view) {
			return;
		}
		const styleVSCodeUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
		const styleMainUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
		const initHTML = `<!DOCTYPE html>
		<html lang="en">
		<head>
		    <meta charset="UTF-8">
		    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view.webview.cspSource}; script-src ;">
		    <meta name="viewport" content="width=device-width, initial-scale=1.0">
		    <link href="${styleVSCodeUri}" rel="stylesheet">
		    <link href="${styleMainUri}" rel="stylesheet">
		    <title>tests</title>
		</head>
		<body>` + sHTML +
			`</body></html>`
		this._view.webview.html = initHTML;
	}
}




