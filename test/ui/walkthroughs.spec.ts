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
        // Webview iframe content is not reliably reachable from the WDIO
        // root session; assert the command succeeds and the shared
        // contribution (same content the panel renders) is populated.
        const opened: {
            ok: boolean;
            error?: string;
            title?: string;
            stepCount?: number;
            firstStep?: string;
        } = await browser.executeWorkbench(async (vscode: typeof VsCode, commandId: string) => {
            try {
                await vscode.commands.executeCommand(commandId);
                const ext = vscode.extensions.getExtension('redhat.ansible');
                const pkg = (ext?.packageJSON ?? {}) as {
                    contributes?: { walkthroughs?: WalkthroughContribution[] };
                };
                const wt = (pkg.contributes?.walkthroughs ?? []).find(
                    (w) => w.id === 'ansible-getting-started',
                );
                return {
                    ok: true,
                    title: wt?.title,
                    stepCount: wt?.steps.length ?? 0,
                    firstStep: wt?.steps[0]?.title,
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }, GET_STARTED_COMMAND);

        expect(opened.ok).toBe(true);
        expect(opened.error).toBeUndefined();
        expect(opened.title).toMatch(/Ansible/i);
        expect(opened.stepCount ?? 0).toBeGreaterThan(3);
        expect(opened.firstStep).toMatch(/sidebar|activity bar/i);
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
