import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
    {
        files: 'out/test/integration/activation.test.js',
        installExtensions: ['ms-python.vscode-python-envs'],
        mocha: { timeout: 60000 },
    },
    {
        label: 'no-python-envs',
        files: 'out/test/integration/activation-no-envs.test.js',
        launchArgs: ['--extensions-dir=.vscode-test/no-envs-extensions'],
        mocha: { timeout: 60000 },
    },
]);
