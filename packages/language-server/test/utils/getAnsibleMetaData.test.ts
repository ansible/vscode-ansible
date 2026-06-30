import { describe, it, expect, vi, beforeEach } from 'vitest';

const runToolMock = vi.hoisted(() => vi.fn());
vi.mock('@ansible/developer-services', () => ({
    getCommandService: () => ({ runTool: runToolMock }),
}));

/**
 * Builds a minimal LSP connection stub for metadata tests.
 *
 * @returns A stub connection with console and window helpers.
 */
function mockConnection() {
    return {
        console: { info: vi.fn(), log: vi.fn(), error: vi.fn() },
        window: { showErrorMessage: vi.fn() },
    };
}

/**
 * Builds a minimal workspace context stub.
 *
 * @param folderUri - Workspace folder URI for the test context.
 * @returns A stub workspace context.
 */
function mockContext(folderUri = 'file:///workspace') {
    return {
        workspaceFolder: { uri: folderUri, name: 'ws' },
    };
}

describe('getAnsibleMetaData', () => {
    let getAnsibleMetaData: typeof import('../../src/utils/getAnsibleMetaData').getAnsibleMetaData;

    beforeEach(async () => {
        vi.resetModules();
        runToolMock.mockReset();
        const mod = await import('../../src/utils/getAnsibleMetaData');
        getAnsibleMetaData = mod.getAnsibleMetaData;
    });

    it('parses ansible and ansible-lint versions from stdout', async () => {
        runToolMock
            .mockResolvedValueOnce({
                stdout: 'ansible [core 2.17.3]\n  config file = /etc/ansible/ansible.cfg',
                stderr: '',
                exitCode: 0,
            })
            .mockResolvedValueOnce({
                stdout: 'ansible-lint 24.12.2 using ...',
                stderr: '',
                exitCode: 0,
            });

        const conn = mockConnection();
        const ctx = mockContext();
        const result = await getAnsibleMetaData(ctx as never, conn as never);

        expect(result.ansibleVersion).toBe('2.17.3');
        expect(result.ansibleLintVersion).toBe('24.12.2');
    });

    it('handles missing ansible gracefully', async () => {
        runToolMock.mockRejectedValueOnce(new Error('not found')).mockResolvedValueOnce({
            stdout: 'ansible-lint 24.12.2',
            stderr: '',
            exitCode: 0,
        });

        const conn = mockConnection();
        const result = await getAnsibleMetaData(mockContext() as never, conn as never);

        expect(result.ansibleVersion).toBeUndefined();
        expect(result.ansibleLintVersion).toBe('24.12.2');
        expect(conn.console.info).toHaveBeenCalledWith('ansible --version failed');
    });

    it('handles missing ansible-lint gracefully', async () => {
        runToolMock
            .mockResolvedValueOnce({
                stdout: 'ansible [core 2.17.3]\n  config file = ...',
                stderr: '',
                exitCode: 0,
            })
            .mockRejectedValueOnce(new Error('not found'));

        const conn = mockConnection();
        const result = await getAnsibleMetaData(mockContext() as never, conn as never);

        expect(result.ansibleVersion).toBe('2.17.3');
        expect(result.ansibleLintVersion).toBeUndefined();
        expect(conn.console.info).toHaveBeenCalledWith('ansible-lint --version failed');
    });

    it('returns empty metadata when both tools fail', async () => {
        runToolMock
            .mockRejectedValueOnce(new Error('no ansible'))
            .mockRejectedValueOnce(new Error('no lint'));

        const conn = mockConnection();
        const result = await getAnsibleMetaData(mockContext() as never, conn as never);

        expect(result.ansibleVersion).toBeUndefined();
        expect(result.ansibleLintVersion).toBeUndefined();
    });

    it('skips version when exit code is non-zero', async () => {
        runToolMock
            .mockResolvedValueOnce({
                stdout: 'some error output',
                stderr: 'error',
                exitCode: 1,
            })
            .mockResolvedValueOnce({
                stdout: '',
                stderr: 'lint not available',
                exitCode: 127,
            });

        const conn = mockConnection();
        const result = await getAnsibleMetaData(mockContext() as never, conn as never);

        expect(result.ansibleVersion).toBeUndefined();
        expect(result.ansibleLintVersion).toBeUndefined();
    });

    it('skips version when stdout has no version pattern', async () => {
        runToolMock
            .mockResolvedValueOnce({
                stdout: 'ansible something without version number',
                stderr: '',
                exitCode: 0,
            })
            .mockResolvedValueOnce({
                stdout: 'lint output without version',
                stderr: '',
                exitCode: 0,
            });

        const conn = mockConnection();
        const result = await getAnsibleMetaData(mockContext() as never, conn as never);

        expect(result.ansibleVersion).toBeUndefined();
        expect(result.ansibleLintVersion).toBeUndefined();
    });
});
