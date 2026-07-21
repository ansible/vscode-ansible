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
        // Deterministic API signal (no fixed sleeps / DOM title polling):
        // command succeeds and the shared contribution the panel renders is populated.
        await browser.waitUntil(
            async () => {
                const opened: {
                    ok: boolean;
                    title: string;
                    stepCount: number;
                    firstStep: string;
                } = await browser.executeWorkbench(
                    async (vscode: typeof VsCode, commandId: string) => {
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
                                title: wt?.title ?? '',
                                stepCount: wt?.steps.length ?? 0,
                                firstStep: wt?.steps[0]?.title ?? '',
                            };
                        } catch {
                            return {
                                ok: false,
                                title: '',
                                stepCount: 0,
                                firstStep: '',
                            };
                        }
                    },
                    GET_STARTED_COMMAND,
                );
                return (
                    opened.ok &&
                    opened.stepCount > 3 &&
                    /Ansible/i.test(opened.title) &&
                    /sidebar|activity bar/i.test(opened.firstStep)
                );
            },
            {
                timeout: 15000,
                interval: 500,
                timeoutMsg: 'Getting Started command did not expose populated walkthrough content',
            },
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
