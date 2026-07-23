import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

interface NavTreeWebview {
    open(): Promise<void>;
    close(): Promise<void>;
}

/**
 * @covers XC-001
 */
describe('Ansible NavTree smoke', () => {
    it('should focus Ansible NavTree and open one accordion section', async () => {
        await browser.executeWorkbench(async (vscode: typeof VsCode) => {
            await vscode.commands.executeCommand('ansible.sidebar.navTree.open');
        });

        const workbench = await browser.getWorkbench();
        let navTree: NavTreeWebview | undefined;

        await browser.waitUntil(
            async () => {
                const webviews = await workbench.getAllWebviews();
                for (const candidate of webviews) {
                    await candidate.open();
                    try {
                        const shell = await $('.ansible-sidebar-shell');
                        if (await shell.isExisting()) {
                            navTree = candidate;
                            return true;
                        }
                    } catch {
                        // Not the NavTree webview — try the next one.
                    }
                    await candidate.close();
                }
                return false;
            },
            {
                timeout: 30_000,
                interval: 500,
                timeoutMsg: 'Ansible NavTree webview did not appear',
            },
        );

        if (!navTree) {
            throw new Error('Ansible NavTree webview missing after wait');
        }

        try {
            await navTree.open();

            const shell = await $('.ansible-sidebar-shell');
            await shell.waitForExist({ timeout: 30_000 });

            const toggle = await $('#sidebar-section-envManagers');
            await toggle.waitForExist({ timeout: 10_000 });

            // Issue-driven suggestOpen may already open a section — normalize closed, then open.
            if ((await toggle.getAttribute('aria-expanded')) === 'true') {
                await toggle.click();
                await browser.waitUntil(
                    async () => (await toggle.getAttribute('aria-expanded')) === 'false',
                    { timeout: 5_000, timeoutMsg: 'Could not collapse Environment Managers' },
                );
            }

            await toggle.click();
            await browser.waitUntil(
                async () => (await toggle.getAttribute('aria-expanded')) === 'true',
                {
                    timeout: 5_000,
                    timeoutMsg: 'Environment Managers section did not expand',
                },
            );

            const panel = await $('#sidebar-panel-envManagers');
            expect(await panel.isExisting()).toBe(true);
        } finally {
            await navTree.close();
        }
    });
});
