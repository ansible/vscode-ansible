/* eslint-disable quotes */
import * as vscode from 'vscode';
import {
  getDocUri,
  activate,
  testDiagnostics,
  sleep,
  updateSettings,
  resetDefaultSettings,
} from '../../helper';

export function testDiagnosticsAnsibleLocal(): void {
  describe('TEST FOR ANSIBLE DIAGNOSTICS', () => {
    const docUri1 = getDocUri('diagnostics/ansible/1.yml');
    const docUri2 = getDocUri('diagnostics/ansible/2.yml');

    before(async () => {
      await resetDefaultSettings();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    describe('Diagnostic test with ansible-lint', () => {
      it('should complain about no task names', async () => {
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

      it('should complain about command syntax-check failed', async function () {
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

    describe('Diagnostic test with ansible-syntax-check', () => {
      before(async () => {
        await updateSettings('ansibleLint.enabled', false);
        await vscode.commands.executeCommand(
          'workbench.action.closeAllEditors'
        );
      });

      it('should return no diagnostics', async function () {
        await activate(docUri1);
        await vscode.commands.executeCommand('workbench.action.files.save');

        await sleep(2000); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri1, []);
      });

      it('should complain about missing `hosts` key', async function () {
        await activate(docUri2);
        await vscode.commands.executeCommand('workbench.action.files.save');

        await sleep(2000); // Wait for the diagnostics to compute on this file

        await testDiagnostics(docUri2, [
          {
            severity: 0,
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
  });
}
