import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
    extensions: {
        getExtension: vi.fn(),
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
    window: {
        showWarningMessage: vi.fn(),
    },
    commands: {
        executeCommand: vi.fn(),
    },
}));

import * as vscode from 'vscode';
import {
    CONFLICTING_EXTENSION_IDS,
    getConflictingExtensions,
    registerExtensionConflictDetection,
} from '../../../src/features/extensionConflicts';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('CONFLICTING_EXTENSION_IDS', () => {
    it('contains the six known conflicting extensions', () => {
        expect(CONFLICTING_EXTENSION_IDS).toContain('haaaad.ansible');
        expect(CONFLICTING_EXTENSION_IDS).toContain('lextudio.restructuredtext');
        expect(CONFLICTING_EXTENSION_IDS).toContain('sysninja.vscode-ansible-mod');
        expect(CONFLICTING_EXTENSION_IDS).toContain('tomaciazek.ansible');
        expect(CONFLICTING_EXTENSION_IDS).toContain('vscoss.vscode-ansible');
        expect(CONFLICTING_EXTENSION_IDS).toContain('zbr.vscode-ansible');
        expect(CONFLICTING_EXTENSION_IDS).toHaveLength(6);
    });

    it('is frozen (readonly)', () => {
        expect(Object.isFrozen(CONFLICTING_EXTENSION_IDS)).toBe(true);
    });
});

describe('getConflictingExtensions', () => {
    it('returns empty array when no conflicts are installed', () => {
        vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
        expect(getConflictingExtensions()).toEqual([]);
    });

    it('returns metadata for each installed conflict', () => {
        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (id === 'haaaad.ansible') {
                return {
                    id: 'haaaad.ansible',
                    packageJSON: { displayName: 'Ansible (haaaad)' },
                } as unknown as vscode.Extension<unknown>;
            }
            if (id === 'zbr.vscode-ansible') {
                return {
                    id: 'zbr.vscode-ansible',
                    packageJSON: { displayName: 'Ansible (zbr)' },
                } as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });

        const conflicts = getConflictingExtensions();
        expect(conflicts).toHaveLength(2);
        expect(conflicts[0]).toEqual({
            id: 'haaaad.ansible',
            displayName: 'Ansible (haaaad)',
        });
        expect(conflicts[1]).toEqual({
            id: 'zbr.vscode-ansible',
            displayName: 'Ansible (zbr)',
        });
    });

    it('falls back to extension ID when displayName is missing', () => {
        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (id === 'tomaciazek.ansible') {
                return {
                    id: 'tomaciazek.ansible',
                    packageJSON: {},
                } as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });

        const conflicts = getConflictingExtensions();
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].displayName).toBe('tomaciazek.ansible');
    });
});

describe('registerExtensionConflictDetection', () => {
    const createMockContext = () => ({
        subscriptions: [] as { dispose: () => void }[],
        globalState: { get: vi.fn(), update: vi.fn() },
    });

    const mockConflict = (id: string, displayName: string) => ({
        id,
        packageJSON: { displayName },
    });

    /**
     * Capture the onDidChange callback so tests can simulate
     * extension install/uninstall events.
     * @returns A function that fires the captured callback
     */
    function captureOnDidChange(): () => void {
        let cb: (() => void) | undefined;
        vi.mocked(vscode.extensions.onDidChange).mockImplementation((listener: () => void) => {
            cb = listener;
            return { dispose: vi.fn() };
        });
        return () => {
            expect(cb).toBeDefined();
            (cb as () => void)();
        };
    }

    /**
     * Create a deferred promise whose resolve function is returned
     * separately, avoiding non-null assertions on the resolve handle.
     * @returns Object with promise and its resolve function
     */
    function deferred<T>(): {
        promise: Promise<T>;
        resolve: (v: T) => void;
    } {
        let resolve: ((v: T) => void) | undefined;
        const promise = new Promise<T>((r) => {
            resolve = r;
        });
        return { promise, resolve: resolve as unknown as (v: T) => void };
    }

    it('checks for conflicts on registration', () => {
        vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
        const ctx = createMockContext();

        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        expect(vscode.extensions.getExtension).toHaveBeenCalled();
    });

    it('shows warning when conflicts are found', () => {
        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (id === 'haaaad.ansible') {
                return mockConflict(id, 'Ansible (haaaad)') as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

        const ctx = createMockContext();
        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('Ansible (haaaad)'),
            'Show Extensions',
            'Dismiss',
        );
    });

    it('does not show warning when no conflicts exist', () => {
        vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
        const ctx = createMockContext();

        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('subscribes to extensions.onDidChange', () => {
        vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
        const ctx = createMockContext();

        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        expect(vscode.extensions.onDidChange).toHaveBeenCalled();
        expect(ctx.subscriptions).toHaveLength(1);
    });

    it('opens extension search with first conflict ID only', async () => {
        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (id === 'haaaad.ansible') {
                return mockConflict(id, 'Ansible (haaaad)') as unknown as vscode.Extension<unknown>;
            }
            if (id === 'zbr.vscode-ansible') {
                return mockConflict(id, 'Ansible (zbr)') as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
            'Show Extensions' as unknown as vscode.MessageItem,
        );

        const ctx = createMockContext();
        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        await vi.waitFor(() => {
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.search',
                '@id:haaaad.ansible',
            );
        });
    });

    it('suppresses repeat warnings after user clicks Dismiss', async () => {
        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (id === 'haaaad.ansible') {
                return mockConflict(id, 'Ansible (haaaad)') as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });

        const { promise, resolve } = deferred<string | undefined>();
        vi.mocked(vscode.window.showWarningMessage).mockReturnValue(
            promise as Thenable<string | undefined>,
        );

        const fireOnDidChange = captureOnDidChange();
        const ctx = createMockContext();

        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);

        resolve('Dismiss');
        await new Promise((r) => setTimeout(r, 0));

        fireOnDidChange();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('re-warns when a new conflict appears after dismiss', async () => {
        const installedSet = new Set(['haaaad.ansible']);

        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (installedSet.has(id)) {
                return mockConflict(id, id) as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });

        const { promise, resolve } = deferred<string | undefined>();
        vi.mocked(vscode.window.showWarningMessage).mockReturnValueOnce(
            promise as Thenable<string | undefined>,
        );

        const fireOnDidChange = captureOnDidChange();
        const ctx = createMockContext();

        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);

        resolve('Dismiss');
        await new Promise((r) => setTimeout(r, 0));

        installedSet.add('zbr.vscode-ansible');
        vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(undefined);

        fireOnDidChange();

        await vi.waitFor(() => {
            expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
        });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
            expect.stringContaining('zbr.vscode-ansible'),
            'Show Extensions',
            'Dismiss',
        );
    });

    it('prevents overlapping notifications from rapid onDidChange events', () => {
        vi.mocked(vscode.extensions.getExtension).mockImplementation((id: string) => {
            if (id === 'haaaad.ansible') {
                return mockConflict(id, 'Ansible (haaaad)') as unknown as vscode.Extension<unknown>;
            }
            return undefined;
        });

        const { promise: _pending } = deferred<string | undefined>();
        vi.mocked(vscode.window.showWarningMessage).mockReturnValue(
            _pending as Thenable<string | undefined>,
        );

        const fireOnDidChange = captureOnDidChange();
        const ctx = createMockContext();

        registerExtensionConflictDetection(ctx as unknown as vscode.ExtensionContext);

        fireOnDidChange();
        fireOnDidChange();
        fireOnDidChange();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });
});
