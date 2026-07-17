import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

const WALKTHROUGH_ID = 'ansible-getting-started';
const GET_STARTED_COMMAND = 'ansible.walkthrough.openGettingStarted';

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

    it('should open Getting Started from the shared command (Cursor-safe)', async () => {
        const opened: { ok: boolean; error?: string } = await browser.executeWorkbench(
            async (vscode: typeof VsCode, commandId: string) => {
                try {
                    await vscode.commands.executeCommand(commandId);
                    return { ok: true };
                } catch (error) {
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            },
            GET_STARTED_COMMAND,
        );

        expect(opened.ok).toBe(true);
        expect(opened.error).toBeUndefined();

        await browser.pause(1500);

        const bodyText: string = await browser.execute(() => {
            return String(document.body?.innerText ?? '');
        });

        expect(bodyText).toMatch(
            /Get started with Ansible|Open the Ansible activity bar|Create a Python environment/i,
        );
    });

    it('should register get-started and telemetry open commands', async () => {
        const registered: string[] = await browser.executeWorkbench(
            async (vscode: typeof VsCode, commands: string[]) => {
                const cmds = await vscode.commands.getCommands(true);
                return commands.filter((c) => cmds.includes(c));
            },
            [GET_STARTED_COMMAND, 'ansible.telemetry.trackWalkthroughOpen'],
        );

        expect(registered).toEqual([GET_STARTED_COMMAND, 'ansible.telemetry.trackWalkthroughOpen']);
    });
});
