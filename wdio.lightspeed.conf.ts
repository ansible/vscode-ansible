/// <reference types="wdio-vscode-service" />
import path from 'node:path';
import { config as baseConfig } from './wdio.conf';

const PKG = path.resolve(process.cwd(), 'packages', 'lightspeed');

export const config: WebdriverIO.Config = {
    ...baseConfig,
    specs: [path.join(PKG, 'test', 'wdio', '**', '*.spec.ts')],
    capabilities: [
        {
            browserName: 'vscode',
            browserVersion: 'stable',
            'wdio:vscodeOptions': {
                extensionPath: path.resolve(process.cwd()),
                workspacePath: path.join(PKG, 'test', 'wdio', 'fixtures'),
                userSettings: {
                    'editor.fontSize': 14,
                    'ansible.lightspeed.enabled': true,
                    'ansible.lightspeed.URL': 'http://localhost:3001',
                },
                vscodeArgs: {
                    'extensions-dir': path.join(
                        path.resolve(process.cwd(), '.wdio-vscode'),
                        'extensions',
                    ),
                    'disable-extensions': false,
                    'disable-gpu': true,
                },
            },
        },
    ],
};
