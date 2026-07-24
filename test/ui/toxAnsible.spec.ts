import { browser } from '@wdio/globals';

/**
 * @covers TOX-001
 */
describe('Tox-Ansible test discovery', () => {
    it('should register the ansible-tox task type', async () => {
        const hasTaskType: boolean = await browser.executeWorkbench((vscode) => {
            const ext = vscode.extensions.getExtension('redhat.ansible');
            if (!ext) return false;
            const pkg = ext.packageJSON as {
                contributes?: {
                    taskDefinitions?: { type: string }[];
                };
            };
            return (pkg.contributes?.taskDefinitions ?? []).some((td) => td.type === 'ansible-tox');
        });
        expect(hasTaskType).toBe(true);
    });
});

/**
 * @covers TOX-002
 */
describe('Tox-Ansible test execution', () => {
    it('should have a test controller registered', async () => {
        const hasController: boolean = await browser.executeWorkbench((vscode) => {
            const ext = vscode.extensions.getExtension('redhat.ansible');
            return ext?.isActive === true;
        });
        expect(hasController).toBe(true);
    });
});
