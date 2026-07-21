import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

const NAV_TREE_VIEW = 'ansibleNavTree';

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

    it('should contribute only Ansible NavTree when AI is disabled', async () => {
        const viewIds: string[] = await browser.executeWorkbench((vscode: typeof VsCode) => {
            const ext = vscode.extensions.getExtension('redhat.ansible');
            if (!ext) return [];
            const pkg = ext.packageJSON as {
                contributes?: { views?: Record<string, { id: string }[]> };
            };
            return Object.values(pkg.contributes?.views ?? {})
                .flat()
                .map((v) => v.id);
        });

        expect(viewIds).toEqual([NAV_TREE_VIEW]);
    });

    it('should keep AI commands available when enableAiFeatures is false', async () => {
        const aiSetting: boolean = await browser.executeWorkbench((vscode: typeof VsCode) => {
            return vscode.workspace
                .getConfiguration('ansibleEnvironments')
                .get<boolean>('enableAiFeatures', true);
        });
        expect(aiSetting).toBe(false);

        const hasAiCommands: boolean = await browser.executeWorkbench(
            async (vscode: typeof VsCode) => {
                const commands = await vscode.commands.getCommands(true);
                return (
                    commands.includes('ansibleMcpTools.refresh') &&
                    commands.includes('ansibleSkills.refresh')
                );
            },
        );
        expect(hasAiCommands).toBe(true);
    });

    it('should keep the extension active and error-free', async () => {
        const isActive: boolean = await browser.executeWorkbench((vscode: typeof VsCode) => {
            const ext = vscode.extensions.getExtension('redhat.ansible');
            return ext?.isActive === true;
        });
        expect(isActive).toBe(true);
    });
});
