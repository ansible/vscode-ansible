/// <reference types="wdio-vscode-service" />
/**
 * WDIO config for running UI smoke tests on Windows.
 *
 * Validates extension activation, UI rendering, and language detection
 * on the Windows platform.  The full language server stack is tested
 * separately inside WSL via vitest (see the Windows + WSL2 workflow).
 */
import path from 'node:path';

const testRoot = path.resolve(process.cwd(), '.wdio-vscode');
const extensionsDir = path.join(testRoot, 'extensions');

export const config: WebdriverIO.Config = {
    runner: 'local',
    tsConfigPath: './test/ui/tsconfig.json',
    specs: ['./test/ui/smoke.spec.ts', './test/ui/languageServer.spec.ts'],

    maxInstances: 1,

    capabilities: [
        {
            browserName: 'vscode',
            browserVersion: 'stable',
            'wdio:vscodeOptions': {
                extensionPath: path.resolve(process.cwd()),
                workspacePath: path.resolve(process.cwd(), 'test', 'ui', 'fixtures'),
                userSettings: {
                    'editor.fontSize': 14,
                },
                vscodeArgs: {
                    'extensions-dir': extensionsDir,
                    'disable-extensions': false,
                },
            },
        },
    ],

    logLevel: 'warn',
    bail: 0,
    waitforTimeout: 10_000,
    connectionRetryTimeout: 120_000,
    connectionRetryCount: 3,

    services: [
        [
            'vscode',
            {
                cachePath: testRoot,
                coverage: {
                    enabled: !!process.env.WDIO_COVERAGE,
                    reporter: ['lcov', 'text'],
                    reportsDirectory: './coverage/wdio',
                    include: ['dist/**'],
                },
            },
        ],
    ],

    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 120_000,
    },
};
