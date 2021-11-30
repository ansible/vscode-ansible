/* eslint-disable quotes */
import * as vscode from 'vscode';
import {
  getDocUri,
  activate,
  sleep,
  resetDefaultSettings,
  testDiagnostics,
  updateSettings,
} from '../../helper';

export function testDiagnosticsYAMLLocal(): void {
  describe('TEST FOR YAML DIAGNOSTICS', () => {
    const docUri1 = getDocUri('diagnostics/yaml/1.yml');

    before(async () => {
      await resetDefaultSettings();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    after(async () => {
      await resetDefaultSettings();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    it('should provide diagnostics with YAML validation (with ansible-lint)', async () => {
      await activate(docUri1);
      await sleep(2000); // Wait for the diagnostics to compute on this file

      await testDiagnostics(docUri1, [
        {
          severity: 0,
          message: 'Ansible syntax check failed',
          range: new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(0, Number.MAX_SAFE_INTEGER)
          ),
          source: 'Ansible',
        },
        {
          severity: 0,
          message: 'Nested mappings are not allowed in compact mappings',
          range: new vscode.Range(
            new vscode.Position(4, 13),
            new vscode.Position(4, 13)
          ),
          source: 'Ansible [YAML]',
        },
        {
          severity: 0,
          message:
            'Document contains trailing content not separated by a ... or --- line',
          range: new vscode.Range(
            new vscode.Position(5, 0),
            new vscode.Position(7, 0)
          ),
          source: 'Ansible [YAML]',
        },
      ]);
    });

    it('should provide diagnostics with YAML validation (with --syntax-check)', async () => {
      await updateSettings('ansibleLint.enabled', false);
      await activate(docUri1);
      await vscode.commands.executeCommand('workbench.action.files.save');

      await sleep(2000); // Wait for the diagnostics to compute on this file

      await testDiagnostics(docUri1, [
        {
          severity: 0,
          message:
            'Syntax Error while loading YAML.\n' +
            '  mapping values are not allowed in this context\n',
          range: new vscode.Range(
            new vscode.Position(4, 21),
            new vscode.Position(4, Number.MAX_SAFE_INTEGER)
          ),
          source: 'Ansible',
        },
        {
          severity: 0,
          message: 'Nested mappings are not allowed in compact mappings',
          range: new vscode.Range(
            new vscode.Position(4, 13),
            new vscode.Position(4, 13)
          ),
          source: 'Ansible [YAML]',
        },
        {
          severity: 0,
          message:
            'Document contains trailing content not separated by a ... or --- line',
          range: new vscode.Range(
            new vscode.Position(5, 0),
            new vscode.Position(7, 0)
          ),
          source: 'Ansible [YAML]',
        },
      ]);
    });
  });
}
