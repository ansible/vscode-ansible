/**
 * Integration test that validates extension activation and degraded-mode
 * behavior when ms-python.vscode-python-envs is NOT available.
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

    test('python-envs extension is not active in this profile', () => {
        const envsExt = vscode.extensions.getExtension(PYTHON_ENVS_ID);
        // Profile may still have the extension on disk (shared install cache from
        // the default suite) but launches with --disable-extension.
        assert.ok(
            !envsExt?.isActive,
            `${PYTHON_ENVS_ID} should not be active in the no-python-envs test profile`,
        );
    });

    test('extension activates without crash', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, 'Extension should be installed');
        assert.ok(ext.isActive, 'Extension should be active');
    });

    test('registers expected commands even without python-envs', async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, 'Extension should be installed');
        assert.ok(ext.isActive, 'Extension should be active before checking commands');

        const contributed = (
            (ext.packageJSON as { contributes?: { commands?: { command: string }[] } }).contributes
                ?.commands ?? []
        ).map((c) => c.command);

        const commands = await vscode.commands.getCommands(true);

        const expectedPrefixes = [
            'ansibleDevToolsPackages',
            'ansibleDevToolsCollections',
            'ansibleCreator',
            'ansiblePlaybooks',
        ];

        for (const prefix of expectedPrefixes) {
            const inPackageJson = contributed.some((cmd) => cmd.startsWith(prefix));
            assert.ok(
                inPackageJson,
                `package.json should contribute commands with prefix "${prefix}"`,
            );
            const found = commands.some((cmd) => cmd.startsWith(prefix));
            assert.ok(
                found,
                `Should register commands with prefix "${prefix}" (active=${String(ext.isActive)}, sample=${commands
                    .filter(
                        (c) =>
                            c.startsWith('ansible') ||
                            c.startsWith('ansibleDevTools') ||
                            c.startsWith('ansibleCreator') ||
                            c.startsWith('ansiblePlaybooks'),
                    )
                    .slice(0, 20)
                    .join(', ')})`,
            );
        }
    });

    test('contributes Ansible NavTree webview regardless of python-envs presence', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        const pkg = ext?.packageJSON as {
            contributes?: { views?: Record<string, { id: string; when?: string }[]> };
        };

        const views = pkg.contributes?.views?.['ansible-environments'];
        assert.ok(views, 'Should contribute views under ansible-environments');
        assert.strictEqual(views.length, 1);
        assert.strictEqual(views[0]?.id, 'ansibleNavTree');
    });

    test('extension remains active after attempting refresh', async () => {
        const commands = await vscode.commands.getCommands(true);
        const refreshCmd = 'ansibleDevToolsPackages.refresh';

        if (commands.includes(refreshCmd)) {
            try {
                await vscode.commands.executeCommand(refreshCmd);
            } catch {
                // Failure is acceptable; crashing is not
            }
        }

        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext?.isActive, 'Extension should still be active');
    });
});
