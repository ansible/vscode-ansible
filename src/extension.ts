// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import AnsibleValidationProvider from './features/validationProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let output = vscode.window.createOutputChannel("Ansible");

	let validator = new AnsibleValidationProvider(context.workspaceState);
	validator.activate(context.subscriptions);

	output.appendLine('Ansible Language extension is now active');
	// output.show();
}

// this method is called when your extension is deactivated
export function deactivate() {}
