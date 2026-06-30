import { describe, it, expect, vi, beforeEach } from 'vitest';

const runToolMock = vi.hoisted(() => vi.fn());
vi.mock('@ansible/developer-services', () => ({
    getCommandService: () => ({ runTool: runToolMock }),
}));

/**
 * Builds a minimal language-server connection stub for AnsibleInventory tests.
 * @returns A stub connection with console and window helpers.
 */
function mockConnection() {
    return {
        console: { error: vi.fn(), log: vi.fn(), info: vi.fn() },
        window: { showErrorMessage: vi.fn() },
    };
}

/**
 * Builds a minimal document context with an optional workspace folder URI.
 * @param folderUri - Workspace folder URI for the test context.
 * @returns A stub document context with the given workspace folder.
 */
function mockContext(folderUri = 'file:///workspace') {
    return {
        workspaceFolder: { uri: folderUri, name: 'ws' },
    };
}

describe('AnsibleInventory', () => {
    let AnsibleInventory: typeof import('../../src/services/ansibleInventory').AnsibleInventory;

    beforeEach(async () => {
        vi.resetModules();
        runToolMock.mockReset();
        const mod = await import('../../src/services/ansibleInventory');
        AnsibleInventory = mod.AnsibleInventory;
    });

    it('parses inventory with groups and hosts', async () => {
        const inventoryJson = JSON.stringify({
            all: { children: ['webservers', 'ungrouped'] },
            webservers: { hosts: ['web1.example.com', 'web2.example.com'] },
            ungrouped: { hosts: ['standalone.example.com'] },
            _meta: { hostvars: {} },
        });

        runToolMock.mockResolvedValueOnce({
            stdout: inventoryJson,
            stderr: '',
            exitCode: 0,
        });

        const inv = new AnsibleInventory(mockConnection() as never, mockContext() as never);
        await inv.initialize();

        const hosts = inv.hostList.map((h) => h.host);
        expect(hosts).toContain('webservers');
        expect(hosts).toContain('web1.example.com');
        expect(hosts).toContain('web2.example.com');
        expect(hosts).toContain('standalone.example.com');
        expect(hosts).toContain('localhost');
        expect(hosts).toContain('all');
    });

    it("returns empty list when inventory has no 'all' key", async () => {
        runToolMock.mockResolvedValueOnce({
            stdout: JSON.stringify({ _meta: { hostvars: {} } }),
            stderr: '',
            exitCode: 0,
        });

        const inv = new AnsibleInventory(mockConnection() as never, mockContext() as never);
        await inv.initialize();
        expect(inv.hostList).toEqual([]);
    });

    it("returns empty list when 'all' has no children array", async () => {
        runToolMock.mockResolvedValueOnce({
            stdout: JSON.stringify({ all: { hosts: ['h1'] } }),
            stderr: '',
            exitCode: 0,
        });

        const inv = new AnsibleInventory(mockConnection() as never, mockContext() as never);
        await inv.initialize();
        expect(inv.hostList).toEqual([]);
    });

    it('handles nested child groups', async () => {
        const inventoryJson = JSON.stringify({
            all: { children: ['dc1'] },
            dc1: { children: ['rack1'] },
            rack1: { hosts: ['node1.rack1'] },
        });

        runToolMock.mockResolvedValueOnce({
            stdout: inventoryJson,
            stderr: '',
            exitCode: 0,
        });

        const inv = new AnsibleInventory(mockConnection() as never, mockContext() as never);
        await inv.initialize();

        const hosts = inv.hostList.map((h) => h.host);
        expect(hosts).toContain('rack1');
        expect(hosts).toContain('node1.rack1');
    });

    it('logs error on invalid JSON', async () => {
        runToolMock.mockResolvedValueOnce({
            stdout: 'not json',
            stderr: '',
            exitCode: 0,
        });

        const conn = mockConnection();
        const inv = new AnsibleInventory(conn as never, mockContext() as never);
        await inv.initialize();

        expect(conn.console.error).toHaveBeenCalled();
        expect(inv.hostList).toEqual([]);
    });

    it('logs error when command throws', async () => {
        runToolMock.mockRejectedValueOnce(new Error('inventory failed'));

        const conn = mockConnection();
        const inv = new AnsibleInventory(conn as never, mockContext() as never);
        await inv.initialize();

        expect(conn.console.error).toHaveBeenCalledWith(
            expect.stringContaining('inventory failed'),
        );
        expect(inv.hostList).toEqual([]);
    });
});
