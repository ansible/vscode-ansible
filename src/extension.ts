// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import AnsibleValidationProvider from './features/validationProvider';
import { toggleEncrypt } from './features/vault';
import { configure } from './features/config';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let output = vscode.window.createOutputChannel("Ansible");

	configure(output);

	let validator = new AnsibleValidationProvider(context.workspaceState, output);
	validator.activate(context.subscriptions);

	output.appendLine('Ansible Language extension is now active');
	// output.show();

	let disposable = vscode.commands.registerCommand('extension.ansible.vault', toggleEncrypt);
	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
