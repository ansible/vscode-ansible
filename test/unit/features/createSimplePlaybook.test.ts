import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Uri } from 'vscode';

const mocks = vi.hoisted(() => ({
    loadSchema: vi.fn(),
    getSchemaNode: vi.fn(),
    getStatus: vi.fn(),
    showErrorMessage: vi.fn(),
    executeCommand: vi.fn(),
    showForm: vi.fn(),
    getInstance: vi.fn(),
}));

vi.mock('vscode', () => ({
    window: {
        showErrorMessage: mocks.showErrorMessage,
    },
    commands: {
        executeCommand: mocks.executeCommand,
    },
    Uri: {
        file: (p: string) => ({ fsPath: p }) as Uri,
    },
}));

vi.mock('@ansible/developer-services', () => ({
    CreatorService: {
        getInstance: () => mocks.getInstance(),
    },
}));

vi.mock('@src/panels/CreatorFormPanel', () => ({
    CreatorFormPanel: {
        show: mocks.showForm,
    },
}));

import {
    openSimplePlaybookCreatorForm,
    SIMPLE_PLAYBOOK_COMMAND_PATH,
} from '../../../src/features/createSimplePlaybook';

describe('openSimplePlaybookCreatorForm', () => {
    const extensionUri = { fsPath: '/ext' } as Uri;

    beforeEach(() => {
        mocks.loadSchema.mockReset();
        mocks.getSchemaNode.mockReset();
        mocks.getStatus.mockReset();
        mocks.showErrorMessage.mockReset();
        mocks.executeCommand.mockReset();
        mocks.showForm.mockReset();
        mocks.getInstance.mockReturnValue({
            loadSchema: mocks.loadSchema,
            getSchemaNode: mocks.getSchemaNode,
            getStatus: mocks.getStatus,
        });
        mocks.loadSchema.mockResolvedValue(null);
        mocks.getStatus.mockReturnValue('ready');
        mocks.showErrorMessage.mockResolvedValue(undefined);
    });

    it('opens the Creator form when add resource playbook is available', async () => {
        const schema = {
            name: 'playbook',
            description: 'Add a sample Ansible playbook file',
        };
        mocks.getSchemaNode.mockReturnValue(schema);

        const opened = await openSimplePlaybookCreatorForm(extensionUri);

        expect(opened).toBe(true);
        expect(mocks.loadSchema).toHaveBeenCalled();
        expect(mocks.getSchemaNode).toHaveBeenCalledWith([...SIMPLE_PLAYBOOK_COMMAND_PATH]);
        expect(mocks.showForm).toHaveBeenCalledWith(
            extensionUri,
            [...SIMPLE_PLAYBOOK_COMMAND_PATH],
            schema,
        );
        expect(mocks.showErrorMessage).not.toHaveBeenCalled();
    });

    it('prompts to install when ansible-creator is not installed', async () => {
        mocks.getSchemaNode.mockReturnValue(null);
        mocks.getStatus.mockReturnValue('not-installed');
        mocks.showErrorMessage.mockResolvedValue('Install ansible-dev-tools');

        const opened = await openSimplePlaybookCreatorForm(extensionUri);

        expect(opened).toBe(false);
        expect(mocks.showForm).not.toHaveBeenCalled();
        expect(mocks.executeCommand).toHaveBeenCalledWith('ansibleDevToolsPackages.install');
    });

    it('prompts to upgrade when ansible-creator lacks playbook resource support', async () => {
        mocks.getSchemaNode.mockReturnValue(null);
        mocks.getStatus.mockReturnValue('ready');
        mocks.showErrorMessage.mockResolvedValue('Upgrade ansible-dev-tools');

        const opened = await openSimplePlaybookCreatorForm(extensionUri);

        expect(opened).toBe(false);
        expect(mocks.showForm).not.toHaveBeenCalled();
        expect(mocks.executeCommand).toHaveBeenCalledWith('ansibleDevToolsPackages.upgrade');
    });

    it('refreshes Creator when the user chooses refresh', async () => {
        mocks.getSchemaNode.mockReturnValue(null);
        mocks.getStatus.mockReturnValue('outdated');
        mocks.showErrorMessage.mockResolvedValue('Refresh Creator');

        const opened = await openSimplePlaybookCreatorForm(extensionUri);

        expect(opened).toBe(false);
        expect(mocks.executeCommand).toHaveBeenCalledWith('ansibleCreator.refresh');
    });
});
