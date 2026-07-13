/**
 * Integration test that validates extension activation and degraded-mode
 * behavior when ms-python.vscode-python-envs is NOT installed.
 *
 * Run via:  pnpm test:integration:no-envs
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'redhat.ansible';
const PYTHON_ENVS_ID = 'ms-python.vscode-python-envs';

suite('Ansible Extension — without python-envs', () => {
    suiteSetup(async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('python-envs extension is NOT installed in this profile', () => {
        const envsExt = vscode.extensions.getExtension(PYTHON_ENVS_ID);
        assert.strictEqual(
            envsExt,
            undefined,
            `${PYTHON_ENVS_ID} should not be installed in the no-python-envs test profile`,
        );
    });

    test('extension activates without crash', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, 'Extension should be installed');
        assert.ok(ext.isActive, 'Extension should be active');
    });

    test('registers expected commands even without python-envs', async () => {
        const commands = await vscode.commands.getCommands(true);

        const expectedPrefixes = [
            'ansibleDevToolsPackages',
            'ansibleDevToolsCollections',
            'ansibleCreator',
            'ansiblePlaybooks',
        ];

        for (const prefix of expectedPrefixes) {
            const found = commands.some((cmd) => cmd.startsWith(prefix));
            assert.ok(found, `Should register commands with prefix "${prefix}"`);
        }
    });

    test('contributes tree views regardless of python-envs presence', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        const pkg = ext?.packageJSON as {
            contributes?: { views?: Record<string, { id: string }[]> };
        };

        const views = pkg.contributes?.views?.['ansible-environments'];
        assert.ok(views, 'Should contribute views under ansible-environments');

        const expectedViewIds = ['ansibleDevToolsEnvManagers', 'ansibleDevToolsPackages'];

        for (const viewId of expectedViewIds) {
            const found = views.some((v: { id: string }) => v.id === viewId);
            assert.ok(found, `Should contribute view "${viewId}"`);
        }
    });

    test('refresh commands do not crash without python-envs', async () => {
        const commands = await vscode.commands.getCommands(true);
        const refreshCmd = 'ansibleDevToolsPackages.refresh';
        assert.ok(commands.includes(refreshCmd), 'Should register the package refresh command');

        try {
            await vscode.commands.executeCommand(refreshCmd);
        } catch {
            // Failure is acceptable; crashing is not
        }

        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext?.isActive, 'Extension should still be active after refresh');
    });
});
