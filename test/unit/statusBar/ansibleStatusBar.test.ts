import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext } from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

interface MockStatusBarItem {
    text: string;
    command: string | undefined;
    backgroundColor: unknown;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
}

interface MockNotificationType {
    method: string;
}

interface MockClient {
    onNotification: ReturnType<typeof vi.fn>;
    sendNotification: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
    _fireNotification: (method: string, data: unknown[]) => void;
}

const { mockCreateStatusBarItem, mockRegisterCommand, mockWindow } = vi.hoisted(() => {
    const _mockCreateStatusBarItem = vi.fn(
        (): MockStatusBarItem => ({
            text: '',
            command: undefined,
            backgroundColor: undefined,
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        }),
    );
    return {
        mockCreateStatusBarItem: _mockCreateStatusBarItem,
        mockRegisterCommand: vi.fn(() => ({ dispose: vi.fn() })),
        mockWindow: {
            createStatusBarItem: _mockCreateStatusBarItem,
            activeTextEditor: undefined,
            showQuickPick: vi.fn(),
        },
    };
});

vi.mock('vscode', () => ({
    window: mockWindow,
    commands: {
        registerCommand: mockRegisterCommand,
        executeCommand: vi.fn(),
    },
    workspace: {
        workspaceFolders: [{ uri: { toString: () => 'file:///workspace' } }],
    },
    StatusBarAlignment: { Right: 2 },
    ThemeColor: class MockThemeColor {
        /**
         * Create a mock ThemeColor.
         * @param id - The theme color identifier.
         */
        constructor(public id: string) {}
    },
    MarkdownString: class MockMarkdownString {
        value: string;
        isTrusted = false;
        supportHtml = false;
        /**
         * Create a mock MarkdownString.
         * @param value - Initial markdown content.
         */
        constructor(value = '') {
            this.value = value;
        }

        /**
         * Append markdown text.
         * @param val - Markdown string to append.
         * @returns This instance for chaining.
         */
        appendMarkdown(val: string) {
            this.value += val;
            return this;
        }
    },
    QuickPickItemKind: { Default: 0, Separator: -1 },
}));

vi.mock('vscode-languageclient/node', () => {
    /**
     * Mock implementation of NotificationType.
     */
    class MockNotificationTypeImpl {
        method: string;
        /**
         * Create a mock NotificationType.
         * @param m - The notification method name.
         */
        constructor(m: string) {
            this.method = m;
        }
    }
    return {
        LanguageClient: class MockLanguageClient {
            /** Placeholder to satisfy no-extraneous-class. */
            public readonly _brand = 'MockLanguageClient';
        },
        NotificationType: MockNotificationTypeImpl,
    };
});

vi.mock('@ansible/services', () => ({
    getCommandService: vi.fn(() => ({
        runTool: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '' }),
    })),
}));

vi.mock('@src/extension', () => ({
    log: vi.fn(),
    outputChannel: { show: vi.fn() },
}));

import { AnsibleStatusBar } from '../../../src/statusBar/ansibleStatusBar';
import type { PythonEnvironmentService } from '../../../src/services/PythonEnvironmentService';

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
 * Create a mock PythonEnvironmentService.
 * @returns A mock env service with getEnvironment and onDidChangeEnvironment.
 */
function createMockEnvService(): {
    getEnvironment: ReturnType<typeof vi.fn>;
    onDidChangeEnvironment: ReturnType<typeof vi.fn>;
    prefersEnvsExtension: ReturnType<typeof vi.fn>;
} {
    return {
        getEnvironment: vi.fn().mockResolvedValue(undefined),
        onDidChangeEnvironment: vi.fn(() => ({ dispose: vi.fn() })),
        prefersEnvsExtension: vi.fn().mockReturnValue(false),
    };
}

/**
 * Create a mock LanguageClient with controllable notification handlers.
 * @returns A mock client with onNotification, sendNotification, isRunning, and _fireNotification.
 */
function createMockClient(): MockClient {
    const notificationHandlers = new Map<string, (data: unknown) => void>();
    return {
        onNotification: vi.fn((type: MockNotificationType, handler: (data: unknown) => void) => {
            notificationHandlers.set(type.method, handler);
        }),
        sendNotification: vi.fn().mockResolvedValue(undefined),
        isRunning: vi.fn().mockReturnValue(true),
        _fireNotification: (method: string, data: unknown[]) => {
            const handler = notificationHandlers.get(method);
            if (handler) handler(data);
        },
    };
}

describe('AnsibleStatusBar', () => {
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
        const client = createMockClient();
        const envService = createMockEnvService();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        expect(mockCreateStatusBarItem).toHaveBeenCalledWith(2, 100);
    });

    it('sets click command to open diagnostics', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.command).toBe('ansible.showDiagnostics');
    });

    it('registers the metadata notification handler', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        expect(client.onNotification).toHaveBeenCalled();
    });

    it('shows even when active editor is not ansible', () => {
        mockWindow.activeTextEditor = { document: { languageId: 'typescript' } };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );
        bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo)');
        expect(item.show).toHaveBeenCalled();
    });

    it('shows loading spinner on first fetch', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );
        bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(sync~spin)');
    });

    it('shows version after metadata notification', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        client._fireNotification('update/ansible-metadata', [
            { ansibleVersion: '2.17.0', ansibleLintVersion: '24.7.0' },
        ]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo)');
    });

    it('shows warning background when ansible-lint is missing', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        client._fireNotification('update/ansible-metadata', [{ ansibleVersion: '2.17.0' }]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo)');
        expect(item.backgroundColor).toEqual({ id: 'statusBarItem.warningBackground' });
    });

    it('shows error background when ansible is not found', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        client._fireNotification('update/ansible-metadata', [{}]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo)');
        expect(item.backgroundColor).toEqual({ id: 'statusBarItem.errorBackground' });
    });

    it('shows clean background when all tools present', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        client._fireNotification('update/ansible-metadata', [
            {
                ansibleVersion: '2.17.0',
                ansibleLintVersion: '24.7.0',
                executionEnvironmentEnabled: true,
            },
        ]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo)');
        expect(item.backgroundColor).toBeUndefined();
    });

    it('exposes metadata for telemetry', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        client._fireNotification('update/ansible-metadata', [
            { ansibleVersion: '2.17.0', pythonVersion: '3.12.5', ansibleLintVersion: '24.7.0' },
        ]);

        const meta = bar.getMetadata();
        expect(meta.ansibleVersion).toBe('2.17.0');
        expect(meta.pythonVersion).toBe('3.12.5');
        expect(meta.ansibleLintVersion).toBe('24.7.0');
    });

    it('does not re-request metadata for the same file', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        bar.update();
        bar.update();
        bar.update();

        expect(client.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('re-requests metadata after forceRefresh', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        bar.update();
        bar.forceRefresh();

        expect(client.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('pushes disposables to context subscriptions', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        const envService = createMockEnvService();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
            envService as unknown as PythonEnvironmentService,
        );

        expect(ctx.subscriptions.length).toBeGreaterThan(0);
    });
});
