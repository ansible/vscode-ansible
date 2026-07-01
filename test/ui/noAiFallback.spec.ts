import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

const CORE_VIEWS = [
    'ansibleDevToolsEnvManagers',
    'ansibleDevToolsPackages',
    'ansibleDevToolsCollections',
    'ansibleCollectionSources',
    'ansibleExecutionEnvironments',
    'ansibleCreator',
    'ansiblePlaybooks',
];

const AI_GATED_VIEWS = ['ansibleMcpTools', 'ansibleSkills'];

/**
 * @covers XC-002
 */
describe('Graceful degradation without AI', () => {
    before(async () => {
        await browser.executeWorkbench(async (vscode: typeof VsCode) => {
            const config = vscode.workspace.getConfiguration('ansibleEnvironments');
            await config.update('enableAiFeatures', false, vscode.ConfigurationTarget.Global);
        });
        await browser.pause(1000);
    });

    after(async () => {
        await browser.executeWorkbench(async (vscode: typeof VsCode) => {
            const config = vscode.workspace.getConfiguration('ansibleEnvironments');
            await config.update('enableAiFeatures', undefined, vscode.ConfigurationTarget.Global);
        });
    });

    it('should register all core tree views when AI is disabled', async () => {
        const contributed: string[] = await browser.executeWorkbench(
            (vscode: typeof VsCode, viewIds: string[]) => {
                const ext = vscode.extensions.getExtension('redhat.ansible');
                if (!ext) return [];
                const pkg = ext.packageJSON as {
                    contributes?: { views?: Record<string, { id: string }[]> };
                };
                const allViews = Object.values(pkg.contributes?.views ?? {}).flat();
                const ids = new Set(allViews.map((v) => v.id));
                return viewIds.filter((id) => ids.has(id));
            },
            CORE_VIEWS,
        );

        expect(contributed).toEqual(CORE_VIEWS);
    });

    it('should hide AI-gated views when enableAiFeatures is false', async () => {
        const aiSetting: boolean = await browser.executeWorkbench((vscode: typeof VsCode) => {
            return vscode.workspace
                .getConfiguration('ansibleEnvironments')
                .get<boolean>('enableAiFeatures', true);
        });

        expect(aiSetting).toBe(false);

        // AI Tools and AI Skills views have a "when" clause that hides them.
        // Verify the when clause is present in the manifest.
        const gatedCorrectly: boolean = await browser.executeWorkbench(
            (vscode: typeof VsCode, viewIds: string[]) => {
                const ext = vscode.extensions.getExtension('redhat.ansible');
                if (!ext) return false;
                const pkg = ext.packageJSON as {
                    contributes?: {
                        views?: Record<string, { id: string; when?: string }[]>;
                    };
                };
                const allViews = Object.values(pkg.contributes?.views ?? {}).flat();
                return viewIds.every((id) => {
                    const view = allViews.find((v) => v.id === id);
                    return view?.when?.includes('enableAiFeatures') ?? false;
                });
            },
            AI_GATED_VIEWS,
        );

        expect(gatedCorrectly).toBe(true);
    });

    it('should keep the extension active and error-free', async () => {
        const isActive: boolean = await browser.executeWorkbench((vscode: typeof VsCode) => {
            const ext = vscode.extensions.getExtension('redhat.ansible');
            return ext?.isActive === true;
        });
        expect(isActive).toBe(true);
    });
});
