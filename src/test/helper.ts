import * as vscode from 'vscode';
import * as path from 'path';
import assert from 'assert';

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

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
  return ansibleConfiguration.update(setting, value, true);
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
      assert.equal(actualDiagnostic.message, expectedDiagnostic.message); // subset of expected message
      assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
      assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
    });
  }
}
