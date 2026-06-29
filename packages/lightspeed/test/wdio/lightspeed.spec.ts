import { browser } from '@wdio/globals';
import { strict as assert } from 'node:assert';
import * as mockServer from './mock-server';

const MOCK_PORT = 3001;

async function getWebviewTabCount(): Promise<number> {
    return (await browser.executeWorkbench(async (vscode) => {
        let count = 0;
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputWebview) count++;
            }
        }
        return count;
    })) as number;
}

async function openPlaybookFixture(): Promise<void> {
    await browser.executeWorkbench(async (vscode, fixture: string) => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) throw new Error('WDIO workspace folder is missing');
        const uri = vscode.Uri.joinPath(folder.uri, fixture);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    }, 'playbook.ansible.yml');
}

async function assertExtensionStillActive(): Promise<void> {
    const active = await browser.executeWorkbench(async (vscode) => {
        const ext = vscode.extensions.getExtension('redhat.ansible');
        return ext?.isActive === true;
    });
    assert(active, 'Ansible extension should remain active');
}

async function injectMockSession(): Promise<void> {
    await browser.waitUntil(
        async () => {
            const ok = await browser.executeWorkbench(async (vscode) => {
                try {
                    await vscode.commands.executeCommand(
                        'ansible.lightspeed.mockSession',
                        {
                            accessToken: 'mock-access-token',
                            accountId: 'mock-account-id',
                            accountLabel: 'Mock WDIO User',
                        },
                    );
                    return true;
                } catch {
                    return false;
                }
            });
            return ok === true;
        },
        {
            timeout: 60_000,
            interval: 2000,
            timeoutMsg: 'mockSession command not available',
        },
    );
}

async function closeAllEditors(): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        try {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        } catch {
            /* ignore */
        }
    });
}

describe('Lightspeed with mock server', () => {
    before(async function () {


        await openPlaybookFixture();
        await browser.waitUntil(
            async () => {
                const active = await browser.executeWorkbench(async (vscode) => {
                    const ext = vscode.extensions.getExtension('redhat.ansible');
                    return ext?.isActive === true;
                });
                return active === true;
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg: 'Extension never activated',
            },
        );

        await mockServer.start(MOCK_PORT);
        await injectMockSession();
    });

    after(async function () {
        await mockServer.stop();
    });

    beforeEach(async () => {
        await injectMockSession();
    });

    afterEach(async () => {
        mockServer.resetResponses();
        await closeAllEditors();
    });

    it('should have Lightspeed commands registered', async function () {
        const result = await browser.executeWorkbench(async (vscode) => {
            const cmds = await vscode.commands.getCommands();
            return cmds.filter(
                (c: string) => typeof c === 'string' && c.startsWith('ansible.lightspeed.'),
            );
        });
        const cmds = result as string[];
        assert(cmds.length > 0, `Expected Lightspeed commands, got: ${JSON.stringify(cmds)}`);
        assert(cmds.includes('ansible.lightspeed.playbookGeneration'), 'Missing playbookGeneration');
        assert(cmds.includes('ansible.lightspeed.roleGeneration'), 'Missing roleGeneration');
        assert(cmds.includes('ansible.lightspeed.playbookExplanation'), 'Missing playbookExplanation');
        assert(cmds.includes('ansible.lightspeed.roleExplanation'), 'Missing roleExplanation');
    });

    it('should open playbook explanation webview', async function () {
        await openPlaybookFixture();
        await browser.pause(2000);

        const beforeCount = await getWebviewTabCount();

        const ran = await browser.executeWorkbench(async (vscode) => {
            try {
                await vscode.commands.executeCommand('ansible.lightspeed.playbookExplanation');
                return true;
            } catch {
                return false;
            }
        });
        assert(ran, 'playbookExplanation command should execute');

        await browser.waitUntil(
            async () => (await getWebviewTabCount()) > beforeCount,
            {
                timeout: 30_000,
                timeoutMsg: 'Expected a webview tab for playbook explanation',
            },
        );
        await assertExtensionStillActive();
    });

    it('should open playbook generation webview', async function () {

        const beforeCount = await getWebviewTabCount();

        const ran = await browser.executeWorkbench(async (vscode) => {
            try {
                await vscode.commands.executeCommand('ansible.lightspeed.playbookGeneration');
                return true;
            } catch {
                return false;
            }
        });
        assert(ran, 'playbookGeneration command should execute');

        await browser.waitUntil(
            async () => (await getWebviewTabCount()) > beforeCount,
            {
                timeout: 30_000,
                timeoutMsg: 'Expected a webview tab for playbook generation',
            },
        );
        await assertExtensionStillActive();
    });

    it('should open role generation webview', async function () {

        const beforeCount = await getWebviewTabCount();

        const ran = await browser.executeWorkbench(async (vscode) => {
            try {
                await vscode.commands.executeCommand('ansible.lightspeed.roleGeneration');
                return true;
            } catch {
                return false;
            }
        });
        assert(ran, 'roleGeneration command should execute');

        await browser.waitUntil(
            async () => (await getWebviewTabCount()) > beforeCount,
            {
                timeout: 30_000,
                timeoutMsg: 'Expected a webview tab for role generation',
            },
        );
        await assertExtensionStillActive();
    });

    it('should handle API errors gracefully', async function () {
        mockServer.setResponse('POST /api/v0/ai/completions/', 401, {
            error: 'unauthorized',
        });

        await openPlaybookFixture();
        await browser.pause(2000);
        await assertExtensionStillActive();
    });

    it('should handle server timeout gracefully', async function () {
        mockServer.setResponse(
            'POST /api/v0/ai/explanations/',
            200,
            { explanationId: 'slow-mock', content: 'delayed', format: 'markdown' },
            60_000,
        );

        await openPlaybookFixture();
        await browser.executeWorkbench(async (vscode) => {
            try {
                await vscode.commands.executeCommand('ansible.lightspeed.playbookExplanation');
            } catch {
                /* expected to timeout */
            }
        });

        await browser.pause(32_000);
        await assertExtensionStillActive();
    });
});
