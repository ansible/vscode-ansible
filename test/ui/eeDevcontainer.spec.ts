import { browser } from '@wdio/globals';
import type * as VsCode from 'vscode';

const COMMAND_ID = 'ansibleExecutionEnvironments.generateDevcontainer';

/**
 * @covers EE-005
 *
 * Form open / `--image` prefill / missing-creator errors are covered by unit
 * tests on `resolveDevcontainerFormPlan` (packages/common). This WDIO suite
 * asserts contribution + runtime registration (same pattern as toxAnsible).
 */
describe('Add Dev Container from an Execution Environment', () => {
    it('should contribute the Add Dev Container command', async () => {
        const contributed: { title?: string } | undefined = await browser.executeWorkbench(
            (vscode: typeof VsCode, commandId: string) => {
                const ext = vscode.extensions.getExtension('redhat.ansible');
                if (!ext) return undefined;
                const pkg = ext.packageJSON as {
                    contributes?: {
                        commands?: { command: string; title: string }[];
                    };
                };
                return (pkg.contributes?.commands ?? []).find((c) => c.command === commandId);
            },
            COMMAND_ID,
        );

        expect(contributed).toBeDefined();
        expect(contributed?.title).toBe('Add Dev Container');
    });

    it('should expose Add Dev Container on the EE tree context menu', async () => {
        const menu: { when?: string; group?: string } | undefined = await browser.executeWorkbench(
            (vscode: typeof VsCode, commandId: string) => {
                const ext = vscode.extensions.getExtension('redhat.ansible');
                if (!ext) return undefined;
                const pkg = ext.packageJSON as {
                    contributes?: {
                        menus?: {
                            'view/item/context'?: {
                                command: string;
                                when?: string;
                                group?: string;
                            }[];
                        };
                    };
                };
                return (pkg.contributes?.menus?.['view/item/context'] ?? []).find(
                    (m) => m.command === commandId,
                );
            },
            COMMAND_ID,
        );

        expect(menu).toBeDefined();
        expect(menu?.when).toContain('view == ansibleExecutionEnvironments');
        expect(menu?.when).toContain('viewItem == executionEnvironment');
    });

    it('should register the Add Dev Container command at runtime', async () => {
        const registered: boolean = await browser.executeWorkbench(
            async (vscode: typeof VsCode, commandId: string) => {
                const ext = vscode.extensions.getExtension('redhat.ansible');
                if (!ext) return false;
                if (!ext.isActive) {
                    await ext.activate();
                }
                const commands = await vscode.commands.getCommands(true);
                return commands.includes(commandId);
            },
            COMMAND_ID,
        );

        expect(registered).toBe(true);
    });
});
