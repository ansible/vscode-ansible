/// <reference types="wdio-vscode-service" />
import path from 'node:path';
import { config as baseConfig } from './wdio.conf';

const PKG = path.resolve(process.cwd(), 'packages', 'lightspeed');

const baseCaps = (baseConfig.capabilities as WebdriverIO.Capabilities[])[0] ?? {};
const baseVscodeOpts =
    (baseCaps as Record<string, unknown>)['wdio:vscodeOptions'] as Record<string, unknown> | undefined;

export const config: WebdriverIO.Config = {
    ...baseConfig,
    specs: [path.join(PKG, 'test', 'wdio', '**', '*.spec.ts')],
    capabilities: [
        {
            ...baseCaps,
            'wdio:vscodeOptions': {
                ...(baseVscodeOpts ?? {}),
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
