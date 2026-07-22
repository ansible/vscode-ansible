import { describe, it, expect, vi } from 'vitest';
import { WorkspaceManager } from '../../src/services/workspaceManager';
import type { Connection, WorkspaceFolder } from 'vscode-languageserver';

/**
 * Builds a minimal LSP connection stub for WorkspaceManager tests.
 *
 * @returns A stub connection with console and workspace helpers.
 */
function mockConnection(): Connection {
    return {
        workspace: {
            getConfiguration: vi.fn().mockResolvedValue({}),
        },
        console: { log: vi.fn(), info: vi.fn(), error: vi.fn() },
        window: {
            showInformationMessage: vi.fn(),
            showWarningMessage: vi.fn(),
        },
    } as unknown as Connection;
}

describe('WorkspaceManager', () => {
    it('ensureFolderContexts creates contexts for known workspace folders', () => {
        const manager = new WorkspaceManager(mockConnection());
        const folders: WorkspaceFolder[] = [
            { uri: 'file:///workspace/a', name: 'a' },
            { uri: 'file:///workspace/b', name: 'b' },
        ];
        manager.setWorkspaceFolders(folders);

        expect(manager.folderContextCount).toBe(0);

        manager.ensureFolderContexts();

        expect(manager.folderContextCount).toBe(2);
    });

    it('ensureFolderContexts is idempotent', () => {
        const manager = new WorkspaceManager(mockConnection());
        manager.setWorkspaceFolders([{ uri: 'file:///workspace', name: 'workspace' }]);

        manager.ensureFolderContexts();
        manager.ensureFolderContexts();

        expect(manager.folderContextCount).toBe(1);
    });

    it('forEachContext materializes contexts before iterating', async () => {
        const manager = new WorkspaceManager(mockConnection());
        manager.setWorkspaceFolders([
            { uri: 'file:///workspace/a', name: 'a' },
            { uri: 'file:///workspace/b', name: 'b' },
        ]);

        const seen: string[] = [];
        await manager.forEachContext((context) => {
            seen.push(context.workspaceFolder.uri);
        });

        expect(seen).toHaveLength(2);
        expect(seen).toEqual(
            expect.arrayContaining(['file:///workspace/a', 'file:///workspace/b']),
        );
        expect(manager.folderContextCount).toBe(2);
    });

    it('forEachContext is a no-op when no workspace folders are set', async () => {
        const manager = new WorkspaceManager(mockConnection());
        const callback = vi.fn();

        await manager.forEachContext(callback);

        expect(callback).not.toHaveBeenCalled();
        expect(manager.folderContextCount).toBe(0);
    });
});
