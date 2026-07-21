import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Node may call exec(cmd, cb) or exec(cmd, opts, cb); promisify uses the latter.
 * @param arg2 - Callback or options argument from the exec call.
 * @param arg3 - Callback when arg2 is options.
 * @returns The exec completion callback.
 */
function asExecCallback(
    arg2: unknown,
    arg3?: unknown,
): (err: Error | null, stdout?: string, stderr?: string) => void {
    if (typeof arg2 === 'function') {
        return arg2 as (err: Error | null, stdout?: string, stderr?: string) => void;
    }
    return arg3 as (err: Error | null, stdout?: string, stderr?: string) => void;
}

const execImpl = vi.hoisted(() =>
    vi.fn((cmd: string, arg2: unknown, arg3?: unknown) => {
        asExecCallback(arg2, arg3)(null, 'out\n', '');
    }),
);

const execExport = vi.hoisted(() => {
    const customPromisify = Symbol.for('nodejs.util.promisify.custom');
    return Object.assign(execImpl, {
        [customPromisify](command: string, options?: Record<string, unknown>) {
            return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                execImpl(
                    command,
                    options ?? {},
                    (err: Error | null, stdout?: string, stderr?: string) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
                        }
                    },
                );
            });
        },
    });
});

const execFileImpl = vi.hoisted(() =>
    vi.fn(
        (
            file: string,
            args: string[],
            optsOrCb:
                | Record<string, unknown>
                | ((err: Error | null, stdout?: string, stderr?: string) => void),
            maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
        ) => {
            const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
            cb?.(null, 'out\n', '');
        },
    ),
);

const execFileExport = vi.hoisted(() => {
    const customPromisify = Symbol.for('nodejs.util.promisify.custom');
    return Object.assign(execFileImpl, {
        [customPromisify](file: string, args: string[], options?: Record<string, unknown>) {
            return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                execFileImpl(
                    file,
                    args,
                    options ?? {},
                    (err: Error | null, stdout?: string, stderr?: string) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
                        }
                    },
                );
            });
        },
    });
});

vi.mock('child_process', () => ({
    exec: execExport,
    execFile: execFileExport,
}));

describe('CommandService', () => {
    let tmpDir: string;
    let previousWorkspace: string | undefined;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ansible-cmd-svc-'));
        previousWorkspace = process.env.ANSIBLE_ENV_WORKSPACE;
        process.env.ANSIBLE_ENV_WORKSPACE = tmpDir;
        execImpl.mockReset();
        execImpl.mockImplementation((cmd: string, arg2: unknown, arg3?: unknown) => {
            asExecCallback(arg2, arg3)(null, 'out\n', '');
        });
        execFileImpl.mockReset();
        execFileImpl.mockImplementation(
            (
                _file: string,
                _args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'out\n', '');
            },
        );
    });

    afterEach(() => {
        if (previousWorkspace === undefined) {
            delete process.env.ANSIBLE_ENV_WORKSPACE;
        } else {
            process.env.ANSIBLE_ENV_WORKSPACE = previousWorkspace;
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
        vi.resetModules();
    });

    it('getInstance returns the same singleton', async () => {
        const { CommandService } = await import('../../src/CommandService');
        const a = CommandService.getInstance();
        const b = CommandService.getInstance();
        expect(a).toBe(b);
    });

    it('runCommand executes via child_process.exec and returns stdout', async () => {
        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            asExecCallback(arg2, arg3)(null, '  hello  \n', '');
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommand('echo "test"', { cwd: tmpDir });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('hello');
        expect(execImpl).toHaveBeenCalled();
    });

    it('runCommand maps exec failures to exitCode and stderr', async () => {
        const err = Object.assign(new Error('command failed'), {
            code: 127,
            stdout: 'partial\n',
            stderr: 'not found\n',
        });
        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            asExecCallback(arg2, arg3)(err, 'partial\n', 'not found\n');
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommand('false', { cwd: tmpDir });
        expect(result.exitCode).toBe(127);
        expect(result.stdout).toBe('partial');
        expect(result.stderr).toContain('not found');
    });

    it('getToolPath resolves a tool in the cached venv bin directory', async () => {
        const binDir = path.join(tmpDir, '.venv', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'ansible-doc');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python3'));

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        await expect(svc.getToolPath('ansible-doc')).resolves.toBe(tool);
    });

    it('runTool runs the resolved executable and forwards args', async () => {
        const binDir = path.join(tmpDir, 'venv2', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'mycli');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                expect(file).toBe(tool);
                expect(args).toEqual(['--flag', 'v']);
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'cli-out\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runTool('mycli', ['--flag', 'v']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('cli-out');
    });

    it('runTool returns structured failure when the tool cannot be resolved', async () => {
        execFileImpl.mockImplementation(
            (
                file: string,
                _args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                if (file === 'which' || file === 'where') {
                    cb?.(new Error('not in path'), '', '');
                    return;
                }
                cb?.(null, 'out\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runTool('tool-that-does-not-exist-zz', []);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('not found');
    });

    it('runAnsibleCreator delegates to runTool with ansible-creator name', async () => {
        const binDir = path.join(tmpDir, 'venv3', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'ansible-creator');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                expect(file).toBe(tool);
                expect(args).toEqual(['init', 'playbook']);
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'creator-ok\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runAnsibleCreator(['init', 'playbook']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('creator-ok');
    });

    it('runAnsibleDoc delegates to runTool', async () => {
        const binDir = path.join(tmpDir, 'venv4', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'ansible-doc');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                expect(file).toBe(tool);
                expect(args).toEqual(['-l']);
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'doc-json\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runAnsibleDoc(['-l']);
        expect(result.stdout).toBe('doc-json');
    });

    it('installCollection runs ade install', async () => {
        const binDir = path.join(tmpDir, 'venv5', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'ade');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                expect(file).toBe(tool);
                expect(args).toEqual(['install', 'ns.coll']);
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'installed\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.installCollection('ns.coll');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('installed');
    });

    it('isToolAvailable reflects getToolPath resolution', async () => {
        const binDir = path.join(tmpDir, 'venv6', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(binDir, 'adt'), '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                if ((file === 'which' || file === 'where') && args.includes('missing-binary-xyz')) {
                    cb?.(new Error('not found'), '', '');
                    return;
                }
                cb?.(null, 'out\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        await expect(svc.isToolAvailable('adt')).resolves.toBe(true);
        await expect(svc.isToolAvailable('missing-binary-xyz')).resolves.toBe(false);
    });

    it('runCommand forwards timeout to exec', async () => {
        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            const opts = typeof arg2 === 'function' ? {} : (arg2 as { timeout?: number });
            expect(opts.timeout).toBe(5000);
            asExecCallback(arg2, arg3)(null, 't\n', '');
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        await svc.runCommand('sleep 999', { cwd: tmpDir, timeout: 5000 });
    });

    it('getWorkspaceRoot prefers ANSIBLE_ENV_WORKSPACE when vscode is absent', async () => {
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        expect(svc.getWorkspaceRoot()).toBe(tmpDir);
    });

    it('getWorkspaceRoot falls back to cwd when ANSIBLE_ENV_WORKSPACE is unset', async () => {
        delete process.env.ANSIBLE_ENV_WORKSPACE;
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        expect(svc.getWorkspaceRoot()).toBe(process.cwd());
    });

    it('getCommandService returns the singleton', async () => {
        const { getCommandService, CommandService } = await import('../../src/CommandService');
        const svc = getCommandService();
        expect(svc).toBe(CommandService.getInstance());
    });

    it('setBinDirResolver injects a resolver used by getBinDir', async () => {
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const resolver = vi.fn().mockResolvedValue('/custom/bin');
        svc.setBinDirResolver(resolver);
        const binDir = await svc.getBinDir();
        expect(binDir).toBe('/custom/bin');
        expect(resolver).toHaveBeenCalled();
    });

    it('getBinDir falls through to cache when resolver returns null', async () => {
        const binDir = path.join(tmpDir, 'cached-venv', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        svc.setBinDirResolver(vi.fn().mockResolvedValue(null));
        const result = await svc.getBinDir();
        expect(result).toBe(binDir);
    });

    it('getBinDir handles resolver that throws an error', async () => {
        const binDir = path.join(tmpDir, 'fallback-venv', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        svc.setBinDirResolver(vi.fn().mockRejectedValue(new Error('resolver boom')));
        const result = await svc.getBinDir();
        expect(result).toBe(binDir);
    });

    it('getBinDir handles resolver that throws a non-Error value', async () => {
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        svc.setBinDirResolver(vi.fn().mockRejectedValue('string error'));
        const result = await svc.getBinDir();
        // Falls through to cache; since no cache is set, returns null
        expect(result).toBeNull();
    });

    it('runCommandArgs executes via execFile and returns stdout', async () => {
        execFileImpl.mockReset();
        execFileImpl.mockImplementation(
            (
                _file: string,
                _args: string[],
                _opts: Record<string, unknown>,
                cb: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                cb(null, 'args-out\n', '');
            },
        );
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommandArgs('echo', ['hello'], { cwd: tmpDir });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('args-out');
        expect(execFileImpl).toHaveBeenCalled();
    });

    it('runCommandArgs maps execFile failures to exitCode and stderr', async () => {
        execFileImpl.mockReset();
        execFileImpl.mockImplementation(
            (
                _file: string,
                _args: string[],
                _opts: Record<string, unknown>,
                cb: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const err = Object.assign(new Error('exec failed'), {
                    code: 2,
                    stdout: 'partial-out\n',
                    stderr: 'err-msg\n',
                });
                cb(err, 'partial-out\n', 'err-msg\n');
            },
        );
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommandArgs('bad-cmd', ['--flag'], { cwd: tmpDir });
        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe('partial-out');
        expect(result.stderr).toBe('err-msg');
    });

    it('runCommandArgs falls back to error message when stderr is missing', async () => {
        execFileImpl.mockReset();
        execFileImpl.mockImplementation(
            (
                _file: string,
                _args: string[],
                _opts: Record<string, unknown>,
                cb: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const err = Object.assign(new Error('spawn failed'), { code: 1 });
                cb(err);
            },
        );
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommandArgs('missing', [], { cwd: tmpDir });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('spawn failed');
        expect(result.stdout).toBe('');
    });

    it('runCommand falls back to error message when stderr is undefined', async () => {
        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            const err = Object.assign(new Error('exec boom'), { code: 1 });
            asExecCallback(arg2, arg3)(err);
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommand('bad', { cwd: tmpDir });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('exec boom');
        expect(result.stdout).toBe('');
    });

    it('runCommand merges custom env options', async () => {
        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            const opts = arg2 as { env?: Record<string, string> };
            expect(opts.env?.MY_VAR).toBe('hello');
            asExecCallback(arg2, arg3)(null, 'ok\n', '');
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runCommand('test', { cwd: tmpDir, env: { MY_VAR: 'hello' } });
        expect(result.exitCode).toBe(0);
    });

    it('runCommand prepends binDir to PATH in env', async () => {
        const binDir = path.join(tmpDir, 'path-venv', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            const opts = arg2 as { env: Record<string, string> };
            expect(opts.env.PATH.startsWith(binDir + path.delimiter)).toBe(true);
            asExecCallback(arg2, arg3)(null, 'ok\n', '');
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        await svc.runCommand('test', { cwd: tmpDir });
    });

    it('runAnsibleNavigator delegates to runTool', async () => {
        const binDir = path.join(tmpDir, 'venv-nav', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'ansible-navigator');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                expect(file).toBe(tool);
                expect(args).toEqual(['run', 'site.yml']);
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'nav-ok\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runAnsibleNavigator(['run', 'site.yml']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('nav-ok');
    });

    it('runAnsibleBuilder delegates to runTool', async () => {
        const binDir = path.join(tmpDir, 'venv-builder', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const tool = path.join(binDir, 'ansible-builder');
        fs.writeFileSync(tool, '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                expect(file).toBe(tool);
                expect(args).toEqual(['build', '-f', 'execution-environment.yml', '-c', 'context']);
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                cb?.(null, 'built\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.runAnsibleBuilder([
            'build',
            '-f',
            'execution-environment.yml',
            '-c',
            'context',
        ]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('built');
    });

    it('getToolPath does not leak PATH when active binDir lacks the tool', async () => {
        const binDir = path.join(tmpDir, 'empty-venv', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(binDir, 'python'), '');
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                if ((file === 'which' || file === 'where') && args.includes('some-tool')) {
                    cb?.(null, '/home/user/.local/bin/some-tool\n', '');
                    return;
                }
                cb?.(null, 'out\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        const result = await svc.getToolPath('some-tool');
        expect(result).toBeNull();
    });

    it('getToolPath falls through to PATH when no binDir is available', async () => {
        const { clearCachedEnvironment } = await import('../../src/EnvironmentCache');
        clearCachedEnvironment();

        execFileImpl.mockImplementation(
            (
                file: string,
                args: string[],
                optsOrCb:
                    | Record<string, unknown>
                    | ((err: Error | null, stdout?: string, stderr?: string) => void),
                maybeCb?: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
                if ((file === 'which' || file === 'where') && args.includes('some-tool')) {
                    cb?.(null, '/usr/bin/some-tool\n', '');
                    return;
                }
                cb?.(null, 'out\n', '');
            },
        );

        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        // Ensure no resolver injects a binDir
        svc.setBinDirResolver(() => Promise.resolve(null));
        const result = await svc.getToolPath('some-tool');
        expect(result).toBe('/usr/bin/some-tool');
    });

    it('runCommandArgs prepends binDir to PATH', async () => {
        const binDir = path.join(tmpDir, 'args-path-venv', 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const { cacheSelectedEnvironment } = await import('../../src/EnvironmentCache');
        cacheSelectedEnvironment(path.join(binDir, 'python'));

        execFileImpl.mockReset();
        execFileImpl.mockImplementation(
            (
                _file: string,
                _args: string[],
                opts: Record<string, unknown>,
                cb: (err: Error | null, stdout?: string, stderr?: string) => void,
            ) => {
                const env = opts.env as Record<string, string>;
                expect(env.PATH).toContain(binDir);
                cb(null, 'ok\n', '');
            },
        );
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        await svc.runCommandArgs('test', [], { cwd: tmpDir });
    });

    it('runCommand uses maxBuffer option', async () => {
        execImpl.mockImplementation((_cmd: string, arg2: unknown, arg3?: unknown) => {
            const opts = arg2 as { maxBuffer?: number };
            expect(opts.maxBuffer).toBe(1024);
            asExecCallback(arg2, arg3)(null, 'ok\n', '');
        });
        const { CommandService } = await import('../../src/CommandService');
        const svc = CommandService.getInstance();
        await svc.runCommand('test', { cwd: tmpDir, maxBuffer: 1024 });
    });
});
