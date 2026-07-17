import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

const WALKTHROUGH_ID = 'ansible-getting-started';
const WALKTHROUGH_FQN = `redhat.ansible#${WALKTHROUGH_ID}`;

interface WalkthroughStep {
    id: string;
    title: string;
}

interface WalkthroughContribution {
    id: string;
    title: string;
    steps: WalkthroughStep[];
}

/**
 * @covers XC-004
 */
describe('Guided walkthroughs', () => {
    it('should contribute a walkthrough from the extension', async () => {
        const walkthroughs: WalkthroughContribution[] = await browser.executeWorkbench(
            (vscode: typeof VsCode) => {
                const ext = vscode.extensions.getExtension('redhat.ansible');
                if (!ext) return [];
                const pkg = ext.packageJSON as {
                    contributes?: { walkthroughs?: WalkthroughContribution[] };
                };
                return pkg.contributes?.walkthroughs ?? [];
            },
        );

        expect(walkthroughs.length).toBeGreaterThan(0);
        const gettingStarted = walkthroughs.find((w) => w.id === WALKTHROUGH_ID);
        expect(gettingStarted).toBeDefined();
        expect(gettingStarted?.title).toContain('Ansible');
        expect(gettingStarted?.steps.length).toBeGreaterThan(0);
        expect(gettingStarted?.steps.map((s) => s.title).join(' ')).toMatch(/sidebar|environment/i);
    });

    it('should open the walkthrough and show guided steps', async () => {
        const opened: { ok: boolean; error?: string } = await browser.executeWorkbench(
            async (vscode: typeof VsCode, walkthroughId: string) => {
                try {
                    await vscode.commands.executeCommand(
                        'ansible.telemetry.trackWalkthroughOpen',
                        walkthroughId,
                    );
                    return { ok: true };
                } catch (error) {
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            },
            WALKTHROUGH_FQN,
        );

        expect(opened.ok).toBe(true);
        expect(opened.error).toBeUndefined();

        await browser.pause(2000);

        const workbench = await browser.getWorkbench();
        const title: string = await workbench.getTitleBar().getTitle();

        // Walkthrough UI may render in a Getting Started webview; assert either
        // chrome title or step copy from the contributed walkthrough.
        const bodyText: string = await browser.execute(() => {
            return String(document.body?.innerText ?? '');
        });

        const stepVisible =
            /Open the Ansible activity bar/i.test(bodyText) ||
            /Get started with Ansible/i.test(bodyText) ||
            /Create a Python environment/i.test(bodyText);
        const titleMatches = /ansible|getting started|walkthrough/i.test(title);
        expect(stepVisible || titleMatches).toBe(true);
    });

    it('should expose the walkthrough open command for usage tracking', async () => {
        const registered: boolean = await browser.executeWorkbench(
            async (vscode: typeof VsCode) => {
                const cmds = await vscode.commands.getCommands(true);
                return cmds.includes('ansible.telemetry.trackWalkthroughOpen');
            },
        );

        expect(registered).toBe(true);
    });
});
