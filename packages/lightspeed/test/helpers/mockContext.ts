import { vi } from 'vitest';

interface MockMemento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Promise<void>;
    keys(): readonly string[];
}

interface MockSecretStorage {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    onDidChange: unknown;
}

export interface MockExtensionContext {
    subscriptions: { dispose(): void }[];
    workspaceState: MockMemento;
    globalState: MockMemento & { setKeysForSync(keys: readonly string[]): void };
    secrets: MockSecretStorage;
    extensionUri: { fsPath: string; scheme: string };
    extensionPath: string;
    storagePath: string | undefined;
    globalStoragePath: string;
    logPath: string;
    extensionMode: number;
    extension: {
        id: string;
        extensionUri: { fsPath: string };
        extensionPath: string;
        packageJSON: Record<string, unknown>;
    };
}

function createMockMemento(): MockMemento {
    const store = new Map<string, unknown>();
    return {
        get<T>(key: string, defaultValue?: T): T | undefined {
            return (store.get(key) as T) ?? defaultValue;
        },
        update: vi.fn(async (key: string, value: unknown) => {
            store.set(key, value);
        }),
        keys: () => [...store.keys()],
    };
}

function createMockSecretStorage(): MockSecretStorage {
    const store = new Map<string, string>();
    return {
        get: vi.fn(async (key: string) => store.get(key)),
        store: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        onDidChange: vi.fn(),
    };
}

export function createMockExtensionContext(
    overrides?: Partial<MockExtensionContext>,
): MockExtensionContext {
    return {
        subscriptions: [],
        workspaceState: createMockMemento(),
        globalState: {
            ...createMockMemento(),
            setKeysForSync: vi.fn(),
        },
        secrets: createMockSecretStorage(),
        extensionUri: { fsPath: '/mock/extension', scheme: 'file' },
        extensionPath: '/mock/extension',
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global-storage',
        logPath: '/mock/logs',
        extensionMode: 1,
        extension: {
            id: 'redhat.ansible',
            extensionUri: { fsPath: '/mock/extension' },
            extensionPath: '/mock/extension',
            packageJSON: { version: '0.0.1' },
        },
        ...overrides,
    };
}
