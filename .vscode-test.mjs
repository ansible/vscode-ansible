import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@vscode/test-cli';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
    {
        label: 'default',
        files: 'out/test/integration/*.test.js',
        installExtensions: ['ms-python.vscode-python-envs'],
        mocha: { timeout: 60000 },
    },
    {
        label: 'no-python-envs',
        files: 'out/test/integration/no-envs/*.test.js',
        // Satisfy package.json extensionDependencies without python-envs (ADR-019).
        installExtensions: ['ms-python.python', 'redhat.vscode-yaml'],
        launchArgs: [`--extensions-dir=${resolve(rootDir, '.vscode-test/no-envs-extensions')}`],
        mocha: { timeout: 60000 },
    },
]);
