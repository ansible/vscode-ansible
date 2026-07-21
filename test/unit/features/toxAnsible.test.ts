import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
    const createTestController = vi.fn();
    const createRunProfile = vi.fn();
    const createTestRun = vi.fn();
    const createTestItem = vi.fn();
    const createFileSystemWatcher = vi.fn();
    const registerTaskProvider = vi.fn();

    const testItems = {
        replace: vi.fn(),
        add: vi.fn(),
        forEach: vi.fn(),
    };

    const controller = {
        createTestItem,
        createRunProfile,
        createTestRun,
        items: testItems,
        refreshHandler: null as (() => void) | null,
        dispose: vi.fn(),
    };

    const watcher = {
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
    };

    return {
        createTestController,
        createRunProfile,
        createTestRun,
        createTestItem,
        createFileSystemWatcher,
        registerTaskProvider,
        testItems,
        controller,
        watcher,
    };
});

vi.mock('vscode', () => ({
    tests: {
        createTestController: (...args: unknown[]) => {
            mocks.createTestController(...args);
            return mocks.controller;
        },
    },
    workspace: {
        workspaceFolders: [
            {
                uri: { fsPath: '/workspace', toString: () => 'file:///workspace' },
                name: 'workspace',
            },
        ],
        createFileSystemWatcher: (...args: unknown[]) => {
            mocks.createFileSystemWatcher(...args);
            return mocks.watcher;
        },
    },
    tasks: {
        registerTaskProvider: mocks.registerTaskProvider,
    },
    TestRunProfileKind: { Run: 1 },
    TestMessage: vi.fn((msg: string) => ({ message: msg })),
    TaskGroup: { Test: { id: 'test' } },
    TaskRevealKind: { Always: 1 },
    TaskScope: { Workspace: 1 },
    ShellExecution: vi.fn((cmd: string, opts?: unknown) => ({ commandLine: cmd, options: opts })),
    Task: vi.fn((def: unknown, scope: unknown, name: string, source: string, exec: unknown) => ({
        definition: def,
        scope,
        name,
        source,
        execution: exec,
        detail: undefined as string | undefined,
        group: undefined,
        presentationOptions: undefined,
    })),
}));

vi.mock('@ansible/developer-services', () => ({
    ToxAnsibleService: vi.fn().mockImplementation(() => ({
        checkAvailability: vi.fn().mockResolvedValue({
            toxInstalled: true,
            toxAnsibleInstalled: true,
            toxVersion: '4.0.0',
        }),
        listEnvironments: vi.fn().mockResolvedValue([
            {
                name: 'unit-py3.12-devel',
                category: 'unit',
                pythonVersion: '3.12',
                ansibleVersion: 'devel',
            },
            {
                name: 'sanity-py3.12-devel',
                category: 'sanity',
                pythonVersion: '3.12',
                ansibleVersion: 'devel',
            },
        ]),
        runEnvironment: vi.fn().mockResolvedValue({
            environment: 'unit-py3.12-devel',
            success: true,
            exitCode: 0,
            stdout: 'OK',
            stderr: '',
            durationMs: 5000,
        }),
    })),
}));

vi.mock('@src/extension', () => ({
    log: vi.fn(),
}));

import { ToxTestController } from '@src/features/toxAnsible/ToxTestController';
import { ToxTaskProvider } from '@src/features/toxAnsible/ToxTaskProvider';
import { registerToxAnsible } from '@src/features/toxAnsible/register';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTestItem.mockImplementation((id: string, label: string) => ({
        id,
        label,
        children: {
            add: vi.fn(),
            forEach: vi.fn(),
            size: 0,
        },
        canResolveChildren: false,
        description: undefined,
    }));
});

describe('ToxTestController', () => {
    it('creates a test controller with correct ID and label', () => {
        const controller = new ToxTestController();
        expect(mocks.createTestController).toHaveBeenCalledWith('ansibleToxTests', 'Ansible Tox');
        controller.dispose();
    });

    it('creates a run profile for execution', () => {
        const controller = new ToxTestController();
        expect(mocks.createRunProfile).toHaveBeenCalledWith('Run', 1, expect.any(Function), true);
        controller.dispose();
    });

    it('sets up file watchers for tox config files', () => {
        const controller = new ToxTestController();
        expect(mocks.createFileSystemWatcher).toHaveBeenCalledWith('**/tox-ansible.ini');
        expect(mocks.createFileSystemWatcher).toHaveBeenCalledWith('**/tox.ini');
        expect(mocks.createFileSystemWatcher).toHaveBeenCalledWith('**/pyproject.toml');
        controller.dispose();
    });

    it('sets a refreshHandler on the controller', () => {
        const controller = new ToxTestController();
        expect(mocks.controller.refreshHandler).not.toBeNull();
        controller.dispose();
    });

    it('disposes all resources', () => {
        const controller = new ToxTestController();
        controller.dispose();
        expect(mocks.controller.dispose).toHaveBeenCalled();
    });
});

describe('ToxTaskProvider', () => {
    it('provides tasks for discovered environments', async () => {
        const provider = new ToxTaskProvider();
        const tasks = await provider.provideTasks();
        expect(tasks).toHaveLength(2);
        expect(tasks[0].name).toBe('unit-py3.12-devel');
        expect(tasks[1].name).toBe('sanity-py3.12-devel');
    });

    it('sets task group to Test', async () => {
        const provider = new ToxTaskProvider();
        const tasks = await provider.provideTasks();
        expect(tasks[0].group).toEqual({ id: 'test' });
    });

    it('returns undefined for non-matching task type on resolve', () => {
        const provider = new ToxTaskProvider();
        const result = provider.resolveTask({
            definition: { type: 'not-tox', environment: 'foo' },
        });
        expect(result).toBeUndefined();
    });
});

describe('registerToxAnsible', () => {
    it('registers controller and task provider', () => {
        const context = {
            subscriptions: { push: vi.fn() },
        };
        registerToxAnsible(context);
        expect(context.subscriptions.push).toHaveBeenCalledTimes(2);
    });
});
