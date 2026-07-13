import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ADT_OUTPUT = `ansible-builder 24.2.0
ansible-core 2.16.1
ansible-creator 24.2.0
ansible-dev-tools 24.2.0
ansible-lint 24.2.0
ansible-navigator 24.2.0
`;

const mocks = vi.hoisted(() => {
    const mockRunTool = vi.fn();
    const mockGetToolPath = vi.fn();
    return {
        mockRunTool,
        mockGetToolPath,
        getCommandService: vi.fn(() => ({
            runTool: mockRunTool,
            getToolPath: mockGetToolPath,
        })),
    };
});

vi.mock('../../src/CommandService', () => ({
    getCommandService: mocks.getCommandService,
}));

import { DevToolsService } from '../../src/DevToolsService';

interface TerminalMockResult {
    factory: ReturnType<typeof vi.fn>;
    mockCreateActivatedTerminal: ReturnType<typeof vi.fn>;
    mockSendCommand: ReturnType<typeof vi.fn>;
}

/**
 * Build a mock terminal service factory that returns a managed terminal
 * with a pre-configured sendCommand result.
 */
function createTerminalMock(sendCommandResult: {
    exitCode: number | undefined;
    success: boolean;
}): TerminalMockResult {
    const mockSendCommand = vi.fn().mockResolvedValue(sendCommandResult);
    const mockCreateActivatedTerminal = vi.fn().mockResolvedValue({
        sendCommand: mockSendCommand,
    });
    const factory = vi.fn(() => ({
        getInstance: () => ({
            createActivatedTerminal: mockCreateActivatedTerminal,
        }),
    }));
    return { factory, mockCreateActivatedTerminal, mockSendCommand };
}

/** Clears the DevToolsService singleton and terminal factory for test isolation. */
function resetDevToolsSingleton(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DevToolsService as any)._instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DevToolsService as any).terminalServiceFactory = undefined;
}

describe('DevToolsService terminal fallback (Layer 3)', () => {
    beforeEach(() => {
        resetDevToolsSingleton();
        mocks.mockRunTool.mockReset();
        mocks.mockGetToolPath.mockReset();
        mocks.getCommandService.mockClear();
        mocks.mockGetToolPath.mockResolvedValue('/mock/bin/adt');
        mocks.getCommandService.mockImplementation(() => ({
            runTool: mocks.mockRunTool,
            getToolPath: mocks.mockGetToolPath,
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    /**
     * Spy on isInVSCode to simulate running inside the VS Code extension
     * host. The real `require('vscode')` fails in test, so we bypass the
     * guard while testing the terminal fallback code path.
     */
    function simulateVSCode(): void {
        vi.spyOn(DevToolsService.prototype, 'isInVSCode').mockReturnValue(true);
    }

    describe('install()', () => {
        it('runs pip install via terminal when no packageInstaller is set', async () => {
            simulateVSCode();
            const { factory, mockSendCommand, mockCreateActivatedTerminal } = createTerminalMock({
                exitCode: 0,
                success: true,
            });
            DevToolsService.setTerminalServiceFactory(factory);

            mocks.mockRunTool.mockResolvedValue({
                exitCode: 0,
                stdout: ADT_OUTPUT,
                stderr: '',
            });

            const svc = DevToolsService.getInstance();
            await svc.install();

            expect(factory).toHaveBeenCalledOnce();
            expect(mockCreateActivatedTerminal).toHaveBeenCalledWith({
                name: 'Install ansible-dev-tools',
                show: true,
            });
            expect(mockSendCommand).toHaveBeenCalledWith('pip install ansible-dev-tools', {
                waitForCompletion: true,
            });
            expect(svc.hasPackages()).toBe(true);
            expect(svc.isLoaded()).toBe(true);
        });

        it('throws when terminalServiceFactory is not registered', async () => {
            simulateVSCode();
            const svc = DevToolsService.getInstance();
            await expect(svc.install()).rejects.toThrow('Package installation is not available');
        });

        it('prefers packageInstaller (Layer 2) over terminal fallback', async () => {
            simulateVSCode();
            const { factory } = createTerminalMock({ exitCode: 0, success: true });
            DevToolsService.setTerminalServiceFactory(factory);

            mocks.mockRunTool.mockResolvedValue({
                exitCode: 0,
                stdout: ADT_OUTPUT,
                stderr: '',
            });

            const installer = vi.fn().mockResolvedValue(undefined);
            const svc = DevToolsService.getInstance();
            svc.setPackageInstaller(installer);

            await svc.install();

            expect(installer).toHaveBeenCalledOnce();
            expect(factory).not.toHaveBeenCalled();
        });

        it('refreshes packages after terminal install completes', async () => {
            simulateVSCode();
            const { factory } = createTerminalMock({ exitCode: 0, success: true });
            DevToolsService.setTerminalServiceFactory(factory);

            mocks.mockRunTool.mockResolvedValue({
                exitCode: 0,
                stdout: 'ansible-lint 7.0.0\n',
                stderr: '',
            });

            const svc = DevToolsService.getInstance();
            await svc.install();

            expect(svc.getPackages()).toHaveLength(1);
            expect(svc.getPackage('ansible-lint')?.version).toBe('7.0.0');
        });

        it('skips polling when exitCode is defined (shell integration present)', async () => {
            simulateVSCode();
            const { factory } = createTerminalMock({ exitCode: 0, success: true });
            DevToolsService.setTerminalServiceFactory(factory);

            mocks.mockRunTool.mockResolvedValue({
                exitCode: 1,
                stdout: '',
                stderr: '',
            });

            const svc = DevToolsService.getInstance();
            await svc.install();

            expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
            expect(svc.hasPackages()).toBe(false);
        });

        it('polls for packages when shell integration is unavailable', async () => {
            vi.useFakeTimers();
            simulateVSCode();

            const { factory } = createTerminalMock({
                exitCode: undefined,
                success: false,
            });
            DevToolsService.setTerminalServiceFactory(factory);

            let refreshCount = 0;
            mocks.mockRunTool.mockImplementation(async () => {
                refreshCount++;
                if (refreshCount >= 2) {
                    return { exitCode: 0, stdout: ADT_OUTPUT, stderr: '' };
                }
                return { exitCode: 1, stdout: '', stderr: '' };
            });

            const svc = DevToolsService.getInstance();
            const installPromise = svc.install();

            await vi.advanceTimersByTimeAsync(5000);
            await installPromise;

            expect(svc.hasPackages()).toBe(true);
            expect(refreshCount).toBe(2);
        });

        it('stops polling once packages are discovered', async () => {
            vi.useFakeTimers();
            simulateVSCode();

            const { factory } = createTerminalMock({
                exitCode: undefined,
                success: false,
            });
            DevToolsService.setTerminalServiceFactory(factory);

            let refreshCount = 0;
            mocks.mockRunTool.mockImplementation(async () => {
                refreshCount++;
                if (refreshCount >= 3) {
                    return { exitCode: 0, stdout: ADT_OUTPUT, stderr: '' };
                }
                return { exitCode: 1, stdout: '', stderr: '' };
            });

            const svc = DevToolsService.getInstance();
            const installPromise = svc.install();

            // Poll 1: refreshCount=2, still no packages
            await vi.advanceTimersByTimeAsync(5000);
            // Poll 2: refreshCount=3, packages found → loop breaks
            await vi.advanceTimersByTimeAsync(5000);
            await installPromise;

            expect(svc.hasPackages()).toBe(true);
            // 1 initial refresh + 2 poll refreshes
            expect(refreshCount).toBe(3);
        });
    });

    describe('upgrade()', () => {
        it('runs pip upgrade via terminal', async () => {
            simulateVSCode();
            const { factory, mockSendCommand, mockCreateActivatedTerminal } = createTerminalMock({
                exitCode: 0,
                success: true,
            });
            DevToolsService.setTerminalServiceFactory(factory);

            mocks.mockRunTool.mockResolvedValue({
                exitCode: 0,
                stdout: ADT_OUTPUT,
                stderr: '',
            });

            const svc = DevToolsService.getInstance();
            await svc.upgrade();

            expect(mockCreateActivatedTerminal).toHaveBeenCalledWith({
                name: 'Upgrade ansible-dev-tools',
                show: true,
            });
            expect(mockSendCommand).toHaveBeenCalledWith(
                'pip install --upgrade --upgrade-strategy eager ansible-dev-tools',
                { waitForCompletion: true },
            );
            expect(svc.isLoaded()).toBe(true);
        });

        it('refreshes packages after upgrade completes', async () => {
            simulateVSCode();
            const { factory } = createTerminalMock({ exitCode: 0, success: true });
            DevToolsService.setTerminalServiceFactory(factory);

            mocks.mockRunTool.mockResolvedValue({
                exitCode: 0,
                stdout: 'ansible-lint 8.0.0\n',
                stderr: '',
            });

            const svc = DevToolsService.getInstance();
            await svc.upgrade();

            expect(svc.getPackage('ansible-lint')?.version).toBe('8.0.0');
        });

        it('returns gracefully when terminalServiceFactory is not set', async () => {
            simulateVSCode();
            const svc = DevToolsService.getInstance();
            await expect(svc.upgrade()).resolves.toBeUndefined();
        });
    });
});
