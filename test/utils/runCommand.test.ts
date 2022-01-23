import { CommandRunner } from '../../src/utils/commandRunner';
import { expect } from 'chai';
import { WorkspaceManager } from '../../src/services/workspaceManager';
import { createConnection } from 'vscode-languageserver/node';
import { getDoc, isWindows } from './helper';


describe('commandRunner', () => {

  const tests = [
    { args: ['ansible-config', 'dump'], rc: 0, stdout: 'ANSIBLE_FORCE_COLOR', stderr: '' },
    { args: ['ansible', '--version'], rc: 0, stdout: 'configured module search path', stderr: '' },
    { args: ['ansible-lint', '--version'], rc: 0, stdout: 'using ansible', stderr: '' },
    { args: ['ansible-playbook', 'missing-file'], rc: 1, stdout: '', stderr: 'ERROR! the playbook: missing-file could not be found' },
  ]

  tests.forEach(({ args, rc, stdout, stderr }) => {
    it(`call ${args.join(' ')}`, async function () {

      this.timeout(10000);
      process.argv.push('--node-ipc');
      const connection = createConnection();
      const workspaceManager = new WorkspaceManager(connection);
      const textDoc = await getDoc('yaml/ancestryBuilder.yml');
      const context = workspaceManager.getContext(textDoc.uri);
      const settings = await context.documentSettings.get(textDoc.uri);

      const commandRunner = new CommandRunner(
        connection,
        context,
        settings
      );
      try {
        const proc = await commandRunner.runCommand(args[0], args.slice(1).join(' '));
        expect(proc.stdout).contains(stdout);
        expect(proc.stderr).contains(stderr);
        }
      catch (e) {
        if (!isWindows()) {
          // ansible does not work on Windows, so we can't test it
          expect(e.code).equals(rc);
          expect(e.stderr).contains(stderr);
          expect(e.stderr).contains(stdout);
        }
        }
      });
    });
  });
