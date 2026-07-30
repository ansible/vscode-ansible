import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockPlaybooksInstance,
    mockTerminalInstance,
    mockManagedTerminal,
    mockLog,
    mockEmitJourneyOutcome,
} = vi.hoisted(() => {
    const mockManagedTerminal = {
        terminal: {},
        sendCommand: vi.fn(),
        dispose: vi.fn(),
    };
    return {
        mockPlaybooksInstance: {
            getPlaybookConfig: vi.fn(),
            buildCommand: vi.fn(),
            buildNavigatorCommand: vi.fn(),
        },
        mockTerminalInstance: {
            createActivatedTerminal: vi.fn(),
        },
        mockManagedTerminal,
        mockLog: vi.fn(),
        mockEmitJourneyOutcome: vi.fn(),
    };
});

vi.mock('vscode', () => ({
    window: {
        activeTextEditor: undefined,
        showErrorMessage: vi.fn(),
    },
    workspace: {
        getWorkspaceFolder: vi.fn(),
        workspaceFolders: undefined,
    },
    commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
}));

vi.mock('@src/extension', () => ({
    log: mockLog,
}));

vi.mock('@src/services/PlaybooksService', () => ({
    PlaybooksService: {
        getInstance: () => mockPlaybooksInstance,
    },
}));

vi.mock('@src/services/TerminalService', () => ({
    TerminalService: {
        getInstance: () => mockTerminalInstance,
    },
}));

vi.mock('@src/services/journeyTelemetry', () => ({
    emitJourneyOutcome: mockEmitJourneyOutcome,
}));

import * as vscode from 'vscode';
import {
    resolvePlaybookRunUri,
    toPlaybookConfigKey,
    runPlaybookFileWithExecutor,
    registerPlaybookContextMenuCommands,
} from '../../../src/features/playbookContextMenu';

/**
 * Build a minimal fake vscode.Uri backed by a filesystem path.
 * @param fsPath - Filesystem path the fake URI should expose
 * @returns A fake vscode.Uri with only `fsPath` populated
 */
function fakeUri(fsPath: string) {
    return { fsPath } as unknown as vscode.Uri;
}

/**
 * Build a minimal fake vscode.WorkspaceFolder.
 * @param name - Workspace folder name
 * @param fsPath - Filesystem path of the workspace folder root
 * @returns A fake vscode.WorkspaceFolder with `name` and `uri` populated
 */
function fakeWorkspaceFolder(name: string, fsPath: string) {
    return { name, uri: fakeUri(fsPath) } as unknown as vscode.WorkspaceFolder;
}

beforeEach(() => {
    vi.clearAllMocks();
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = undefined;
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    mockPlaybooksInstance.getPlaybookConfig.mockReturnValue({});
    mockPlaybooksInstance.buildCommand.mockReturnValue('ansible-playbook site.yml');
    mockPlaybooksInstance.buildNavigatorCommand.mockReturnValue('ansible-navigator run site.yml');
    mockTerminalInstance.createActivatedTerminal.mockResolvedValue(mockManagedTerminal);
    mockManagedTerminal.sendCommand.mockResolvedValue(undefined);
});

describe('resolvePlaybookRunUri', () => {
    it('returns the explorer-provided uri when it has an fsPath', () => {
        const uri = fakeUri('/ws/explorer.yml');
        expect(resolvePlaybookRunUri(uri)).toBe(uri);
    });

    it('falls back to the active editor document when no uri is provided', () => {
        const editorUri = fakeUri('/ws/active.yml');
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = {
            document: { uri: editorUri },
        };
        expect(resolvePlaybookRunUri(undefined)).toBe(editorUri);
    });

    it('returns undefined when there is no uri and no active editor', () => {
        expect(resolvePlaybookRunUri(undefined)).toBeUndefined();
    });
});

describe('toPlaybookConfigKey', () => {
    it('returns the bare relative path in a single-root workspace', () => {
        (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
            fakeWorkspaceFolder('root', '/ws'),
        ];
        const folder = fakeWorkspaceFolder('root', '/ws');
        expect(toPlaybookConfigKey(folder, 'site.yml')).toBe('site.yml');
    });

    it('returns the bare relative path when workspaceFolders is undefined', () => {
        const folder = fakeWorkspaceFolder('root', '/ws');
        expect(toPlaybookConfigKey(folder, 'site.yml')).toBe('site.yml');
    });

    it('prefixes with the folder name in a multi-root workspace', () => {
        const folder = fakeWorkspaceFolder('proj-a', '/ws/proj-a');
        (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
            folder,
            fakeWorkspaceFolder('proj-b', '/ws/proj-b'),
        ];
        expect(toPlaybookConfigKey(folder, 'deploy/site.yml')).toBe('proj-a/deploy/site.yml');
    });
});

describe('runPlaybookFileWithExecutor', () => {
    it('shows an error and does not launch a terminal when no file can be resolved', async () => {
        await runPlaybookFileWithExecutor(undefined, 'ansible-playbook');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'No playbook file selected to run.',
        );
        expect(mockTerminalInstance.createActivatedTerminal).not.toHaveBeenCalled();
    });

    it('shows an error when the target file is outside any open workspace folder', async () => {
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

        await runPlaybookFileWithExecutor(fakeUri('/outside/site.yml'), 'ansible-playbook');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Playbook must be inside an open workspace folder to run.',
        );
        expect(mockTerminalInstance.createActivatedTerminal).not.toHaveBeenCalled();
    });

    it('resolves the active editor, builds the ansible-playbook command, and launches a terminal', async () => {
        const workspaceFolder = fakeWorkspaceFolder('root', '/ws');
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = {
            document: { uri: fakeUri('/ws/site.yml') },
        };
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder);

        await runPlaybookFileWithExecutor(undefined, 'ansible-playbook');

        expect(mockPlaybooksInstance.getPlaybookConfig).toHaveBeenCalledWith('site.yml');
        expect(mockPlaybooksInstance.buildCommand).toHaveBeenCalledWith(
            'site.yml',
            expect.objectContaining({ executor: 'ansible-playbook' }),
        );
        expect(mockPlaybooksInstance.buildNavigatorCommand).not.toHaveBeenCalled();
        expect(mockTerminalInstance.createActivatedTerminal).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'ansible-playbook: site.yml',
                cwd: workspaceFolder.uri,
                show: true,
            }),
        );
        expect(mockManagedTerminal.sendCommand).toHaveBeenCalledWith('ansible-playbook site.yml', {
            waitForCompletion: false,
        });
        expect(mockEmitJourneyOutcome).toHaveBeenCalledWith(
            'playbook.run',
            'success',
            expect.objectContaining({
                extra: { source: 'contextMenu', executor: 'ansible-playbook' },
            }),
        );
    });

    it('uses the explorer-provided uri and forces the navigator executor', async () => {
        const workspaceFolder = fakeWorkspaceFolder('root', '/ws');
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder);

        await runPlaybookFileWithExecutor(fakeUri('/ws/nested/site.yml'), 'ansible-navigator');

        // Explorer path must not depend on the active editor at all.
        expect((vscode.window as { activeTextEditor: unknown }).activeTextEditor).toBeUndefined();
        expect(mockPlaybooksInstance.buildNavigatorCommand).toHaveBeenCalledWith(
            'nested/site.yml',
            expect.objectContaining({ executor: 'ansible-navigator' }),
        );
        expect(mockPlaybooksInstance.buildCommand).not.toHaveBeenCalled();
        expect(mockManagedTerminal.sendCommand).toHaveBeenCalledWith(
            'ansible-navigator run site.yml',
            { waitForCompletion: false },
        );
    });

    it('reuses saved per-playbook configuration and overrides only the executor', async () => {
        const workspaceFolder = fakeWorkspaceFolder('root', '/ws');
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder);
        mockPlaybooksInstance.getPlaybookConfig.mockReturnValue({
            executor: 'ansible-navigator',
            inventory: 'inventory/prod.ini',
            limit: 'webservers',
        });

        await runPlaybookFileWithExecutor(fakeUri('/ws/site.yml'), 'ansible-playbook');

        expect(mockPlaybooksInstance.buildCommand).toHaveBeenCalledWith('site.yml', {
            executor: 'ansible-playbook',
            inventory: 'inventory/prod.ini',
            limit: 'webservers',
        });
    });

    it('emits an error outcome, shows a message, and rethrows when the launch fails', async () => {
        const workspaceFolder = fakeWorkspaceFolder('root', '/ws');
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder);
        const launchError = new Error('terminal creation failed');
        mockTerminalInstance.createActivatedTerminal.mockRejectedValue(launchError);

        await expect(
            runPlaybookFileWithExecutor(fakeUri('/ws/site.yml'), 'ansible-playbook'),
        ).rejects.toThrow('terminal creation failed');

        expect(mockEmitJourneyOutcome).toHaveBeenCalledWith(
            'playbook.run',
            'error',
            expect.objectContaining({
                errorCode: 'launch_failed',
                extra: { source: 'contextMenu', executor: 'ansible-playbook' },
            }),
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to run playbook: terminal creation failed',
        );
    });
});

describe('registerPlaybookContextMenuCommands', () => {
    it('registers both commands and disposes them via the extension context', () => {
        const context = { subscriptions: [] as { dispose: () => void }[] };

        registerPlaybookContextMenuCommands(
            context as unknown as import('vscode').ExtensionContext,
        );

        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
            'ansiblePlaybooks.runFileWithAnsiblePlaybook',
            expect.any(Function),
        );
        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
            'ansiblePlaybooks.runFileWithNavigator',
            expect.any(Function),
        );
        expect(context.subscriptions).toHaveLength(2);
    });

    it('wires the ansible-playbook command handler to force the ansible-playbook executor', async () => {
        const workspaceFolder = fakeWorkspaceFolder('root', '/ws');
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder);
        const context = { subscriptions: [] as { dispose: () => void }[] };

        registerPlaybookContextMenuCommands(
            context as unknown as import('vscode').ExtensionContext,
        );

        const handler = vi
            .mocked(vscode.commands.registerCommand)
            .mock.calls.find(
                ([name]) => name === 'ansiblePlaybooks.runFileWithAnsiblePlaybook',
            )?.[1] as (uri?: vscode.Uri) => Promise<void>;

        await handler(fakeUri('/ws/site.yml'));

        expect(mockPlaybooksInstance.buildCommand).toHaveBeenCalledWith(
            'site.yml',
            expect.objectContaining({ executor: 'ansible-playbook' }),
        );
    });

    it('wires the navigator command handler to force the ansible-navigator executor', async () => {
        const workspaceFolder = fakeWorkspaceFolder('root', '/ws');
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder);
        const context = { subscriptions: [] as { dispose: () => void }[] };

        registerPlaybookContextMenuCommands(
            context as unknown as import('vscode').ExtensionContext,
        );

        const handler = vi
            .mocked(vscode.commands.registerCommand)
            .mock.calls.find(([name]) => name === 'ansiblePlaybooks.runFileWithNavigator')?.[1] as (
            uri?: vscode.Uri,
        ) => Promise<void>;

        await handler(fakeUri('/ws/site.yml'));

        expect(mockPlaybooksInstance.buildNavigatorCommand).toHaveBeenCalledWith(
            'site.yml',
            expect.objectContaining({ executor: 'ansible-navigator' }),
        );
    });
});
