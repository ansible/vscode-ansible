/// <reference types="wdio-vscode-service" />
import path from 'node:path';

const testRoot = path.resolve(process.cwd(), '.wdio-vscode');
const extensionsDir = path.join(testRoot, 'extensions');

export const config: WebdriverIO.Config = {
    runner: 'local',
    tsConfigPath: './test/ui/tsconfig.json',
    specs: ['./test/ui/**/*.spec.ts'],
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
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: [
        [
            'vscode',
            {
                cachePath: testRoot,
                coverage: {
                    enabled: process.env.WDIO_COVERAGE === '1',
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
        timeout: 120000,
    },
};
