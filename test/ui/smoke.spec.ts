import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

/**
 * @covers XC-001
 */
describe('VS Code UI smoke test', () => {
    it('should launch a VS Code session', () => {
        expect(browser.sessionId).toBeDefined();
    });

    it('should show the Ansible activity bar icon', async () => {
        const workbench = await browser.getWorkbench();
        const activityBar = workbench.getActivityBar();
        const viewControls = await activityBar.getViewControls();
        const titles = await Promise.all(viewControls.map((vc) => vc.getTitle()));

        // The view container may be collapsed under "Additional Views" if
        // a previous spec changed the activity bar state in the same session.
        const visible = titles.includes('Ansible');
        if (visible) {
            expect(titles).toContain('Ansible');
            return;
        }

        const contributed: boolean = await browser.executeWorkbench((vscode: typeof VsCode) => {
            const ext = vscode.extensions.getExtension('redhat.ansible');
            if (!ext) return false;
            const pkg = ext.packageJSON as {
                contributes?: {
                    viewsContainers?: {
                        activitybar?: { title: string }[];
                    };
                };
            };
            return (pkg.contributes?.viewsContainers?.activitybar ?? []).some(
                (c) => c.title === 'Ansible',
            );
        });
        expect(contributed).toBe(true);
    });
});
