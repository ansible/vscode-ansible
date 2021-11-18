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
          message:
            '[unnamed-task] All tasks should be named\n' +
            'Description: All tasks should have a distinct name for readability and for ``--start-at-task`` to work',
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
          message:
            '[syntax-check] Ansible syntax check failed\n' +
            'Description: Running ``ansible-playbook --syntax-check ...`` failed.\n' +
            '\n' +
            'This error **cannot be disabled** due to being a prerequisite for other steps.\n' +
            'You can either exclude these files from linting or better assure they can be\n' +
            'loaded by Ansible. This is often achieved by editing inventory file and/or\n' +
            '``ansible.cfg`` so ansible can load required variables.\n' +
            '\n' +
            'If undefined variables are the failure reason you could use jinja default()\n' +
            'filter in order to provide fallback values.\n',
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
        message:
          'Command failed: ansible-playbook /home/prsahoo/Desktop/Ansible_Language_Server/dev/vscode-ansible/src/test/testFixtures/diagnostics/2.yml --syntax-check\n' +
          '[WARNING]: No inventory was parsed, only implicit localhost is available\n' +
          '[WARNING]: provided hosts list is empty, only localhost is available. Note that\n' +
          // eslint-disable-next-line quotes
          "the implicit localhost does not match 'all'\n" +
          // eslint-disable-next-line quotes
          "ERROR! the field 'hosts' is required but was not set\n",
        range: new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_SAFE_INTEGER)
        ),
        source: 'Ansible',
      },
    ]);
  });
});
