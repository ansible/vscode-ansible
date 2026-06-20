/// <reference types="wdio-vscode-service" />
import path from 'node:path';
import { config as baseConfig } from './wdio.conf';

const PKG = path.resolve(process.cwd(), 'packages', 'lightspeed');

export const config: WebdriverIO.Config = {
    ...baseConfig,
    specs: [path.join(PKG, 'test', 'wdio', '**', '*.spec.ts')],
    capabilities: [
        {
            ...((baseConfig.capabilities as WebdriverIO.Capabilities[])[0] || {}),
            'wdio:vscodeOptions': {
                ...((baseConfig.capabilities as any[])[0]?.['wdio:vscodeOptions'] || {}),
                workspacePath: path.join(PKG, 'test', 'wdio', 'fixtures'),
                userSettings: {
                    'editor.fontSize': 14,
                    'ansible.lightspeed.enabled': true,
                    'ansible.lightspeed.URL': 'http://localhost:3001',
                },
            },
        },
    ],
};
