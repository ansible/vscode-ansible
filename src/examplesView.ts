
import * as vscode from "vscode";

export class ExamplesViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'lightspeed-examples-webview';

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
	const styleUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
	const initHTML = `<!DOCTYPE html>
		<html lang="en">
		<head>
		    <meta charset="UTF-8">
		    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view.webview.cspSource}; script-src ;">
		    <meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link href="${styleUri}" rel="stylesheet">
		    <title>tests</title>
		</head>
		<body>` + sHTML +
			`</body></html>`
		this._view.webview.html = initHTML;
	}
}




