import * as vscode from 'vscode';
import * as path from 'path';
import { assert } from 'chai';

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;

// Default ansible configurations
export const defaultAnsibleConfigurations = {
  'ansible.useFullyQualifiedCollectionNames': true,
  'ansibleLint.arguments': '',
  'ansibleLint.enabled': true,
  'ansibleLint.path': 'ansible-lint',
  'ansibleNavigator.path': 'ansible-navigator',
  'executionEnvironment.containerEngine': 'auto',
  'executionEnvironment.enabled': false,

  'executionEnvironment.image':
    'quay.io/ansible/ansible-devtools-demo-ee:v0.1.0',

  'executionEnvironment.pullPolicy': 'missing',
  'python.activationScript': '',
  'python.interpreterPath': 'python3',
  'ansible.path': 'ansible',
};

/**
 * Activates the redhat.ansible extension
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activate(docUri: vscode.Uri): Promise<any> {
  const extension = vscode.extensions.getExtension('redhat.ansible');
  const activation = await extension?.activate();

  try {
    doc = await vscode.workspace.openTextDocument(docUri);
    editor = await vscode.window.showTextDocument(doc, {
      preview: true,
      preserveFocus: false,
    });
    await vscode.languages.setTextDocumentLanguage(doc, 'ansible');

    await sleep(5000); // Wait for server activation

    return activation;
  } catch (e) {
    console.error('Error from activation -> ', e);
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDocPath = (p: string): string => {
  return path.resolve(
    __dirname,
    path.join('..', '..', '..', 'src', 'test', 'testFixtures', p)
  );
};

export const getDocUri = (p: string): vscode.Uri => {
  return vscode.Uri.file(getDocPath(p));
};

export async function updateSettings(
  setting: string,
  value: unknown
): Promise<void> {
  const ansibleConfiguration = vscode.workspace.getConfiguration('ansible');
  return ansibleConfiguration.update(setting, value, false);
}

export async function resetDefaultSettings(): Promise<void> {
  const ansibleConfiguration = vscode.workspace.getConfiguration('ansible');
  Object.entries(defaultAnsibleConfigurations).forEach((config) => {
    ansibleConfiguration.update(config[0], config[1], false);
  });
  await sleep(1000);
}

export async function testDiagnostics(
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[]
): Promise<void> {
  const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

  assert.strictEqual(actualDiagnostics.length, expectedDiagnostics.length);

  if (actualDiagnostics.length !== 0 && expectedDiagnostics.length !== 0) {
    expectedDiagnostics.forEach((expectedDiagnostic, i) => {
      const actualDiagnostic = actualDiagnostics[i];
      assert.include(actualDiagnostic.message, expectedDiagnostic.message); // subset of expected message
      assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
      assert.strictEqual(
        actualDiagnostic.severity,
        expectedDiagnostic.severity
      );
    });
  }
}
