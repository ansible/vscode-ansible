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

    it('creates a status bar item with right alignment and priority 99', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        expect(mockCreateStatusBarItem).toHaveBeenCalledWith(2, 99);
    });

    it('registers the click command', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        expect(mockRegisterCommand).toHaveBeenCalledWith(
            'ansible.statusBar.ansibleClick',
            expect.any(Function),
        );
    });

    it('registers the metadata notification handler', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        expect(client.onNotification).toHaveBeenCalled();
    });

    it('hides when active editor is not ansible', () => {
        mockWindow.activeTextEditor = { document: { languageId: 'typescript' } };

        const ctx = createMockContext();
        const client = createMockClient();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );
        bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.hide).toHaveBeenCalled();
    });

    it('shows loading spinner on first fetch', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );
        bar.update();

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(sync~spin) Ansible');
    });

    it('shows version after metadata notification', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        client._fireNotification('update/ansible-metadata', [
            { ansibleVersion: '2.17.0', ansibleLintVersion: '24.7.0' },
        ]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo) 2.17.0');
    });

    it('shows warning when ansible-lint is missing', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        client._fireNotification('update/ansible-metadata', [{ ansibleVersion: '2.17.0' }]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(warning) 2.17.0');
    });

    it('shows error when ansible is not found', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        client._fireNotification('update/ansible-metadata', [{}]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(error) Ansible');
    });

    it('shows EE tag when execution environment is enabled', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        void new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        client._fireNotification('update/ansible-metadata', [
            {
                ansibleVersion: '2.17.0',
                ansibleLintVersion: '24.7.0',
                executionEnvironmentEnabled: true,
            },
        ]);

        const item = mockCreateStatusBarItem.mock.results[0].value as MockStatusBarItem;
        expect(item.text).toBe('$(ansible-logo) [EE] 2.17.0');
    });

    it('exposes metadata for telemetry', () => {
        mockWindow.activeTextEditor = {
            document: { languageId: 'ansible', uri: { toString: () => 'file:///test.yml' } },
        };

        const ctx = createMockContext();
        const client = createMockClient();
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
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
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
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
        const bar = new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        bar.update();
        bar.forceRefresh();

        expect(client.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('pushes disposables to context subscriptions', () => {
        const ctx = createMockContext();
        const client = createMockClient();
        new AnsibleStatusBar(
            ctx as unknown as ExtensionContext,
            client as unknown as LanguageClient,
        );

        expect(ctx.subscriptions.length).toBeGreaterThan(0);
    });
});
