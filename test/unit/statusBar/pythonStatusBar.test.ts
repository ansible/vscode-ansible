import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext } from 'vscode';
import type { PythonEnvironmentService } from '../../../src/services/PythonEnvironmentService';

interface MockStatusBarItem {
    text: string;
    command: string | undefined;
    backgroundColor: unknown;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
}

interface MockPythonEnv {
    displayName: string;
    name: string;
    version: string;
    execInfo: { run: { executable: string } };
}

interface MockEnvService {
    getEnvironment: ReturnType<typeof vi.fn>;
    onDidChangeEnvironment: ReturnType<typeof vi.fn>;
    _fireChange: () => void;
}

const { mockCreateStatusBarItem, mockRegisterCommand, mockExecuteCommand } = vi.hoisted(() => ({
    mockCreateStatusBarItem: vi.fn(
        (): MockStatusBarItem => ({
            text: '',
            command: undefined,
            backgroundColor: undefined,
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        }),
    ),
    mockRegisterCommand: vi.fn(() => ({ dispose: vi.fn() })),
    mockExecuteCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
    window: {
        createStatusBarItem: mockCreateStatusBarItem,
        activeTextEditor: undefined as unknown,
        showQuickPick: vi.fn(),
    },
    commands: {
        registerCommand: mockRegisterCommand,
        executeCommand: mockExecuteCommand,
    },
    workspace: {
        workspaceFolders: [
            { uri: { fsPath: '/mock/workspace', toString: () => 'file:///mock/workspace' } },
        ],
    },
    StatusBarAlignment: { Right: 2 },
    ThemeColor: class MockThemeColor {
        /**
         * Create a mock ThemeColor.
         * @param id - The theme color identifier.
         */
        constructor(public id: string) {}
    },
    QuickPickItemKind: { Default: 0, Separator: -1 },
}));

vi.mock('vscode-languageclient/node', () => ({
    LanguageClient: class MockLanguageClient {
        /** Placeholder to satisfy no-extraneous-class. */
        public readonly _brand = 'MockLanguageClient';
    },
    NotificationType: class {
        /**
         * Create a mock NotificationType.
         * @param method - The notification method name.
         */
        constructor(public method: string) {}
    },
}));

vi.mock('@src/extension', () => ({
    log: vi.fn(),
    outputChannel: { show: vi.fn() },
}));

import { PythonStatusBar } from '../../../src/statusBar/pythonStatusBar';

/**
 * Create a mock ExtensionContext with a subscriptions array.
 * @returns A mock context suitable for status bar construction.
 */
function createMockContext(): { subscriptions: { dispose(): void }[] } {
    return {
        subscriptions: [] as { dispose(): void }[],
    };
}

/**
 * Create a mock PythonEnvironmentService with controllable responses.
 * @param env - Optional environment data to return from getEnvironment.
 * @returns A mock service with getEnvironment, onDidChangeEnvironment, and _fireChange.
 */
function createMockEnvService(env?: MockPythonEnv): MockEnvService {
    const listeners: ((args: Record<string, unknown>) => void)[] = [];
    return {
        getEnvironment: vi.fn().mockResolvedValue(env),
        onDidChangeEnvironment: vi.fn((cb: (args: Record<string, unknown>) => void) => {
            listeners.push(cb);
            return { dispose: vi.fn() };
        }),
        _fireChange: () => {
            for (const l of listeners) l({});
        },
    };
}

describe('PythonStatusBar', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockCreateStatusBarItem.mockReturnValue({
            text: '',
            command: undefined,
            backgroundColor: undefined,
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        });
        mockRegisterCommand.mockReturnValue({ dispose: vi.fn() });
    });

    it('creates a status bar item with right alignment and priority 100', () => {
        const ctx = createMockContext();
        const envService = createMockEnvService();
        new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );

        expect(mockCreateStatusBarItem).toHaveBeenCalledWith(2, 100);
    });

    it('registers the click command', () => {
        const ctx = createMockContext();
        const envService = createMockEnvService();
        new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );

        expect(mockRegisterCommand).toHaveBeenCalledWith(
            'ansible.statusBar.pythonClick',
            expect.any(Function),
        );
    });

    it('subscribes to environment change events', () => {
        const ctx = createMockContext();
        const envService = createMockEnvService();
        new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );

        expect(envService.onDidChangeEnvironment).toHaveBeenCalled();
    });

    it('shows even when active editor is not ansible', async () => {
        const vscode = await import('vscode');
        (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
            document: { languageId: 'typescript', uri: { fsPath: '/mock/file.ts' } },
        };

        const ctx = createMockContext();
        const envService = createMockEnvService();
        const bar = new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );
        await bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.show).toHaveBeenCalled();
    });

    it('shows using workspace folder when no editor is active', async () => {
        const vscode = await import('vscode');
        (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined;

        const ctx = createMockContext();
        const envService = createMockEnvService();
        const bar = new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );
        await bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.show).toHaveBeenCalled();
        expect(envService.getEnvironment).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/mock/workspace' }),
        );
    });

    it('shows env display name when environment is available', async () => {
        const vscode = await import('vscode');
        (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
            document: { languageId: 'ansible' },
        };

        const env: MockPythonEnv = {
            displayName: 'Python 3.12 (.venv)',
            name: 'venv',
            version: '3.12.5',
            execInfo: { run: { executable: '/usr/bin/python3' } },
        };
        const ctx = createMockContext();
        const envService = createMockEnvService(env);
        const bar = new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );
        await bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(python) Python 3.12 (.venv)');
        expect(item.show).toHaveBeenCalled();
    });

    it('shows warning when no environment configured', async () => {
        const vscode = await import('vscode');
        (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
            document: { languageId: 'ansible' },
        };

        const ctx = createMockContext();
        const envService = createMockEnvService(undefined);
        const bar = new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );
        await bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(warning) Select Python');
        expect(item.show).toHaveBeenCalled();
    });

    it('exposes environment info for telemetry', async () => {
        const vscode = await import('vscode');
        (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
            document: { languageId: 'ansible' },
        };

        const env: MockPythonEnv = {
            displayName: 'Python 3.12',
            name: 'venv',
            version: '3.12.5',
            execInfo: { run: { executable: '/usr/bin/python3' } },
        };
        const ctx = createMockContext();
        const envService = createMockEnvService(env);
        const bar = new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );
        await bar.update();

        const info = bar.getEnvironmentInfo();
        expect(info.pythonEnvDisplayName).toBe('Python 3.12');
        expect(info.pythonVersion).toBe('3.12.5');
        expect(info.pythonEnvPath).toBe('/usr/bin/python3');
    });

    it('clears cached info when environment becomes unavailable', async () => {
        const vscode = await import('vscode');
        (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = {
            document: { languageId: 'ansible' },
        };

        const ctx = createMockContext();
        const envService = createMockEnvService(undefined);
        const bar = new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );
        await bar.update();

        const info = bar.getEnvironmentInfo();
        expect(info.pythonEnvDisplayName).toBeUndefined();
        expect(info.pythonVersion).toBeUndefined();
    });

    it('pushes disposables to context subscriptions', () => {
        const ctx = createMockContext();
        const envService = createMockEnvService();
        new PythonStatusBar(
            ctx as unknown as ExtensionContext,
            envService as unknown as PythonEnvironmentService,
        );

        expect(ctx.subscriptions.length).toBeGreaterThan(0);
    });
});
