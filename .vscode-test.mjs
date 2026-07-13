import { defineConfig } from '@vscode/test-cli';

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
        launchArgs: ['--extensions-dir=.vscode-test/no-envs-extensions'],
        mocha: { timeout: 60000 },
    },
]);
