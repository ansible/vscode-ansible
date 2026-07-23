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
        // Satisfy package.json extensionDependencies. @vscode/test-cli installs into
        // the shared .vscode-test/extensions cache and does not honor a custom
        // --extensions-dir in launchArgs, so isolation uses --disable-extension
        // instead of an empty extensions dir (ADR-019 degraded mode).
        installExtensions: ['ms-python.python', 'redhat.vscode-yaml'],
        launchArgs: ['--disable-extension=ms-python.vscode-python-envs'],
        mocha: { timeout: 60000 },
    },
]);
