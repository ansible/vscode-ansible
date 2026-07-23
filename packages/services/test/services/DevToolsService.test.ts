import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    const mockGetBinDir = vi.fn().mockResolvedValue(null);
    const mockRunCommandArgs = vi.fn();
    return {
        mockRunTool,
        mockGetToolPath,
        mockGetBinDir,
        mockRunCommandArgs,
        getCommandService: vi.fn(() => ({
            runTool: mockRunTool,
            getToolPath: mockGetToolPath,
            getBinDir: mockGetBinDir,
            runCommandArgs: mockRunCommandArgs,
        })),
    };
});

vi.mock('../../src/CommandService', () => ({
    getCommandService: mocks.getCommandService,
}));

vi.mock('../../src/EnvironmentCache', () => ({
    getCachedEnvironment: vi.fn().mockReturnValue(null),
    getCachedBinDir: vi.fn().mockReturnValue(null),
    getCachedToolPath: vi.fn().mockReturnValue(null),
    findExecutableWithCache: vi.fn().mockResolvedValue(null),
}));

import { DevToolsService } from '../../src/DevToolsService';

/** Clears the DevToolsService singleton and terminal factory for test isolation. */
function resetDevToolsSingleton(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DevToolsService as any)._instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DevToolsService as any).terminalServiceFactory = undefined;
}

describe('DevToolsService', () => {
    beforeEach(() => {
        resetDevToolsSingleton();
        mocks.mockRunTool.mockReset();
        mocks.mockGetToolPath.mockReset();
        mocks.mockGetBinDir.mockReset();
        mocks.mockRunCommandArgs.mockReset();
        mocks.getCommandService.mockClear();
        mocks.mockGetToolPath.mockResolvedValue('/mock/bin/adt');
        mocks.mockGetBinDir.mockResolvedValue(null);
        mocks.getCommandService.mockImplementation(() => ({
            runTool: mocks.mockRunTool,
            getToolPath: mocks.mockGetToolPath,
            getBinDir: mocks.mockGetBinDir,
            runCommandArgs: mocks.mockRunCommandArgs,
        }));
    });

    it('getInstance returns the same singleton', () => {
        const a = DevToolsService.getInstance();
        const b = DevToolsService.getInstance();
        expect(a).toBe(b);
    });

    it('refresh loads and parses adt --version output', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: ADT_OUTPUT,
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(mocks.mockRunTool).toHaveBeenCalledWith('adt', ['--version']);
        expect(svc.getPackages().map((p) => p.name)).toEqual([
            'ansible-builder',
            'ansible-core',
            'ansible-creator',
            'ansible-dev-tools',
            'ansible-lint',
            'ansible-navigator',
        ]);
        expect(svc.getPackage('ansible-core')?.version).toBe('2.16.1');
        expect(svc.isLoaded()).toBe(true);
    });

    it('refresh handles adt not found (exit code != 0)', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 1,
            stdout: '',
            stderr: 'not found',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()).toEqual([]);
        expect(svc.hasPackages()).toBe(false);
        expect(svc.isLoaded()).toBe(true);
    });

    it('refresh concurrent call protection (isLoading guard)', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => {
            release = r;
        });
        let notifyEntered!: () => void;
        const enteredRunTool = new Promise<void>((r) => {
            notifyEntered = r;
        });
        mocks.mockRunTool.mockImplementation(async () => {
            notifyEntered();
            await gate;
            return { exitCode: 0, stdout: ADT_OUTPUT, stderr: '' };
        });
        const svc = DevToolsService.getInstance();
        const p1 = svc.refresh();
        await enteredRunTool;
        const p2 = svc.refresh();
        await p2;
        expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
        release();
        await p1;
        expect(svc.getPackages().length).toBe(6);
        expect(mocks.mockRunTool).toHaveBeenCalledTimes(1);
    });

    it('getPackages returns loaded packages', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: ADT_OUTPUT,
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()[0]).toEqual({
            name: 'ansible-builder',
            version: '24.2.0',
            location: '/mock/bin/ansible-builder',
        });
    });

    it('hasPackages returns true or false correctly', async () => {
        const svc = DevToolsService.getInstance();
        expect(svc.hasPackages()).toBe(false);
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: ADT_OUTPUT,
            stderr: '',
        });
        await svc.refresh();
        expect(svc.hasPackages()).toBe(true);
    });

    it('getPackage finds by name', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: ADT_OUTPUT,
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackage('ansible-lint')).toEqual({
            name: 'ansible-lint',
            version: '24.2.0',
            location: '/mock/bin/ansible-lint',
        });
    });

    it('getPackage returns undefined for unknown name', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: ADT_OUTPUT,
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackage('not-a-package')).toBeUndefined();
    });

    it('setTerminalServiceFactory stores the factory', () => {
        const factory = vi.fn(() => ({}));
        DevToolsService.setTerminalServiceFactory(factory);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((DevToolsService as any).terminalServiceFactory).toBe(factory);
    });

    it('install prefers pip exec when selected python is known', async () => {
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ansible-adt-venv-bin-'));
        const python = path.join(binDir, 'python3');
        try {
            fs.writeFileSync(python, '');
            mocks.mockGetBinDir.mockResolvedValue(binDir);
            mocks.mockRunCommandArgs.mockResolvedValue({
                exitCode: 0,
                stdout: 'Successfully installed ansible-dev-tools',
                stderr: '',
            });
            mocks.mockRunTool.mockResolvedValue({
                exitCode: 0,
                stdout: ADT_OUTPUT,
                stderr: '',
            });
            const installer = vi.fn().mockResolvedValue(undefined);
            const svc = DevToolsService.getInstance();
            svc.setPackageInstaller(installer);
            await svc.install();
            expect(mocks.mockRunCommandArgs).toHaveBeenCalledWith(
                python,
                ['-m', 'pip', 'install', 'ansible-dev-tools'],
                { timeout: 600_000 },
            );
            expect(installer).not.toHaveBeenCalled();
            expect(svc.hasPackages()).toBe(true);
        } finally {
            fs.rmSync(binDir, { recursive: true, force: true });
        }
    });

    it('install delegates to packageInstaller when no python path is known', async () => {
        mocks.mockGetBinDir.mockResolvedValue(null);
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: ADT_OUTPUT,
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        const installer = vi.fn().mockResolvedValue(undefined);
        svc.setPackageInstaller(installer);
        await svc.install();
        expect(installer).toHaveBeenCalledOnce();
        expect(svc.isLoaded()).toBe(true);
    });

    it('install throws when not in vscode', async () => {
        const svc = DevToolsService.getInstance();
        await expect(svc.install()).rejects.toThrow('install is only available in VS Code');
    });

    it('isInVSCode is false in test environment', () => {
        expect(DevToolsService.getInstance().isInVSCode()).toBe(false);
    });

    it('upgrade throws when not in VS Code', async () => {
        const svc = DevToolsService.getInstance();
        await expect(svc.upgrade()).rejects.toThrow('upgrade is only available in VS Code');
    });

    it('refresh clears packages when runTool throws', async () => {
        mocks.mockRunTool.mockRejectedValue(new Error('spawn failed'));
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()).toEqual([]);
        expect(svc.isLoaded()).toBe(true);
    });

    it('isLoading and isLoaded state transitions', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => {
            release = r;
        });
        let notifyEntered!: () => void;
        const enteredRunTool = new Promise<void>((r) => {
            notifyEntered = r;
        });
        mocks.mockRunTool.mockImplementation(async () => {
            notifyEntered();
            await gate;
            return { exitCode: 0, stdout: ADT_OUTPUT, stderr: '' };
        });
        const svc = DevToolsService.getInstance();
        expect(svc.isLoading()).toBe(false);
        expect(svc.isLoaded()).toBe(false);
        const p = svc.refresh();
        await enteredRunTool;
        expect(svc.isLoading()).toBe(true);
        release();
        await p;
        expect(svc.isLoading()).toBe(false);
        expect(svc.isLoaded()).toBe(true);
    });

    it('hasPackages returns false when no packages loaded', () => {
        const svc = DevToolsService.getInstance();
        expect(svc.hasPackages()).toBe(false);
    });

    it('getPackage returns undefined when package not found', () => {
        const svc = DevToolsService.getInstance();
        expect(svc.getPackage('nonexistent')).toBeUndefined();
    });

    it('getPackage returns the package when found', async () => {
        mocks.mockRunTool.mockResolvedValueOnce({
            exitCode: 0,
            stdout: 'ansible-lint 6.0.0\nansible-navigator 3.0.0\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackage('ansible-lint')).toEqual({
            name: 'ansible-lint',
            version: '6.0.0',
            location: '/mock/bin/ansible-lint',
        });
    });

    it('refresh handles adt failure with non-zero exit code', async () => {
        mocks.mockRunTool.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not found' });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()).toEqual([]);
        expect(svc.isLoaded()).toBe(true);
    });

    it('refresh handles thrown errors gracefully', async () => {
        mocks.mockRunTool.mockRejectedValueOnce(new Error('spawn failed'));
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()).toEqual([]);
    });

    it("refresh skips lines that don't match expected format", async () => {
        mocks.mockRunTool.mockResolvedValueOnce({
            exitCode: 0,
            stdout: 'ansible-lint 6.0.0\n  some extra info\nansible-navigator 3.0.0\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()).toHaveLength(2);
    });

    it('isInVSCode returns false in test environment', () => {
        const svc = DevToolsService.getInstance();
        expect(svc.isInVSCode()).toBe(false);
    });

    it('install throws when not in VS Code (duplicate)', async () => {
        const svc = DevToolsService.getInstance();
        await expect(svc.install()).rejects.toThrow('install is only available in VS Code');
    });

    it('upgrade throws when not in VS Code', async () => {
        const svc = DevToolsService.getInstance();
        await expect(svc.upgrade()).rejects.toThrow('upgrade is only available in VS Code');
    });

    it('refresh sets packages with no location when getToolPath returns null', async () => {
        mocks.mockGetToolPath.mockResolvedValue(null);
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: 'ansible-lint 6.0.0\nansible-navigator 3.0.0\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        const packages = svc.getPackages();
        expect(packages).toHaveLength(2);
        expect(packages[0].location).toBeUndefined();
        expect(packages[1].location).toBeUndefined();
    });

    it('onDidChange fires during refresh lifecycle', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: 'ansible-lint 6.0.0\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        const listener = vi.fn();
        const disposable = (svc.onDidChange as (cb: () => void) => { dispose: () => void })(
            listener,
        );
        await svc.refresh();
        // fire() is called twice: once at start (loading=true), once at end (loading=false)
        expect(listener).toHaveBeenCalledTimes(2);
        disposable.dispose();
    });

    it('refresh handles output with only whitespace lines', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: '   \n\n  \n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        expect(svc.getPackages()).toHaveLength(0);
        expect(svc.isLoaded()).toBe(true);
    });

    it('refresh handles output with mixed valid and header lines', async () => {
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: 'ansible-dev-tools version 24.2.0:\nansible-lint 24.2.0\nansible-core 2.16.1\n---\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        const packages = svc.getPackages();
        expect(packages).toHaveLength(2);
        expect(packages[0].name).toBe('ansible-lint');
        expect(packages[1].name).toBe('ansible-core');
    });

    it('refresh produces correct locations on non-win32', async () => {
        mocks.mockGetToolPath.mockResolvedValue('/usr/local/bin/adt');
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: 'ansible-lint 6.0.0\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        await svc.refresh();
        const pkg = svc.getPackage('ansible-lint');
        expect(pkg?.location).toBe('/usr/local/bin/ansible-lint');
    });

    it('setPackageInstaller and install calls installer then refresh', async () => {
        const installer = vi.fn().mockResolvedValue(undefined);
        mocks.mockRunTool.mockResolvedValue({
            exitCode: 0,
            stdout: 'ansible-lint 7.0.0\n',
            stderr: '',
        });
        const svc = DevToolsService.getInstance();
        svc.setPackageInstaller(installer);
        await svc.install();
        expect(installer).toHaveBeenCalledOnce();
        expect(svc.isLoaded()).toBe(true);
        expect(svc.getPackages()).toHaveLength(1);
    });
});
