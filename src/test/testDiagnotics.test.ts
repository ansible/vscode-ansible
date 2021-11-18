import * as vscode from 'vscode';
import {
  getDocUri,
  activate,
  testDiagnostics,
  sleep,
  updateSettings,
} from './helper';

describe('TEST FOR DIAGNOSTICS (local)', () => {
  const docUri1 = getDocUri('diagnostics/1.yml');
  const docUri2 = getDocUri('diagnostics/2.yml');

  beforeEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  describe('Diagnostic test with ansible-lint', () => {
    it('Test 1', async () => {
      await updateSettings('ansibleLint.enabled', true);

      await activate(docUri1);
      await vscode.commands.executeCommand('workbench.action.files.save');

      await sleep(2000); // Wait for the diagnostics to compute on this file

      await testDiagnostics(docUri1, [
        {
          severity: 0,
          message: 'All tasks should be named',
          range: new vscode.Range(
            new vscode.Position(3, 0),
            new vscode.Position(3, Number.MAX_SAFE_INTEGER)
          ),
          source: 'Ansible',
        },
      ]);
    });

    it('Test 2', async function () {
      await updateSettings('ansibleLint.enabled', true);

      await activate(docUri2);
      await vscode.commands.executeCommand('workbench.action.files.save');

      await sleep(2000); // Wait for the diagnostics to compute on this file

      await testDiagnostics(docUri2, [
        {
          severity: 0,
          message: 'Ansible syntax check failed',
          range: new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(0, Number.MAX_SAFE_INTEGER)
          ),
          source: 'Ansible',
        },
      ]);
    });
  });

  describe('Diagnostic test with ansyble-syntax-check', () => {
    it('Test 1', async function () {
      await updateSettings('ansibleLint.enabled', false);

      await activate(docUri1);
      await vscode.commands.executeCommand('workbench.action.files.save');

      await sleep(2000); // Wait for the diagnostics to compute on this file

      await testDiagnostics(docUri1, []);
    });
  });

  it('Test 2', async function () {
    await updateSettings('ansibleLint.enabled', false);

    await activate(docUri2);
    await vscode.commands.executeCommand('workbench.action.files.save');

    await sleep(2000); // Wait for the diagnostics to compute on this file

    await testDiagnostics(docUri2, [
      {
        severity: 0,
        // eslint-disable-next-line quotes
        message: "the field 'hosts' is required but was not set",
        range: new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_SAFE_INTEGER)
        ),
        source: 'Ansible',
      },
    ]);
  });
});
