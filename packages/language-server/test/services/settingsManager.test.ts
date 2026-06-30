import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from '../../src/services/settingsManager';

/**
 * Builds a minimal LSP connection stub returning the given configuration.
 *
 * @param configResult - Configuration object to resolve from getConfiguration.
 * @returns A stub connection with workspace helpers.
 */
function mockConnection(configResult: Record<string, unknown> = {}) {
    return {
        workspace: {
            getConfiguration: vi.fn().mockResolvedValue(configResult),
        },
        console: { log: vi.fn(), info: vi.fn(), error: vi.fn() },
    };
}

describe('SettingsManager', () => {
    describe('without client config support', () => {
        let sm: SettingsManager;

        beforeEach(() => {
            sm = new SettingsManager(null, false);
        });

        it('get() returns global settings', async () => {
            const settings = await sm.get('file:///doc.yml');
            expect(settings).toBe(sm.globalSettings);
        });

        it('default settings have expected shape', () => {
            const s = sm.globalSettings;
            expect(s.ansible).toBeDefined();
            expect(s.validation).toBeDefined();
            expect(s.python).toBeDefined();
            expect(s.completion).toBeDefined();
        });

        it('default ansible.path is "ansible"', () => {
            expect(sm.globalSettings.ansible.path).toBe('ansible');
        });

        it('default validation.enabled is true', () => {
            expect(sm.globalSettings.validation.enabled).toBe(true);
        });

        it('default validation.lint.enabled is true', () => {
            expect(sm.globalSettings.validation.lint.enabled).toBe(true);
        });

        it('handleConfigurationChanged replaces global settings', async () => {
            const handler = vi.fn();
            sm.onConfigurationChanged('file:///ws', handler);

            const newSettings = {
                ansible: {
                    path: '/usr/local/bin/ansible',
                    useFullyQualifiedCollectionNames: false,
                },
                validation: { enabled: false },
            };
            await sm.handleConfigurationChanged({
                settings: { ansible: newSettings },
            });

            expect(sm.globalSettings).toEqual(newSettings);
            expect(handler).toHaveBeenCalled();
        });

        it('handleConfigurationChanged falls back to defaults for empty settings', async () => {
            const originalDefaults = sm.globalSettings;
            await sm.handleConfigurationChanged({ settings: {} });
            expect(sm.globalSettings).toEqual(originalDefaults);
        });
    });

    describe('with client config support', () => {
        it('get() fetches and merges per-document settings', async () => {
            const conn = mockConnection({
                ansible: { path: '/custom/ansible' },
            });
            const sm = new SettingsManager(conn as never, true);

            const settings = await sm.get('file:///doc.yml');
            expect(conn.workspace.getConfiguration).toHaveBeenCalledWith({
                scopeUri: 'file:///doc.yml',
                section: 'ansible',
            });
            expect(settings.ansible.path).toBe('/custom/ansible');
        });

        it('caches settings for the same URI', async () => {
            const conn = mockConnection({});
            const sm = new SettingsManager(conn as never, true);

            await sm.get('file:///doc.yml');
            await sm.get('file:///doc.yml');
            expect(conn.workspace.getConfiguration).toHaveBeenCalledTimes(1);
        });

        it('handleDocumentClosed removes cached settings', async () => {
            const conn = mockConnection({});
            const sm = new SettingsManager(conn as never, true);

            await sm.get('file:///doc.yml');
            sm.handleDocumentClosed('file:///doc.yml');
            await sm.get('file:///doc.yml');
            expect(conn.workspace.getConfiguration).toHaveBeenCalledTimes(2);
        });

        it('handleConfigurationChanged re-fetches and fires handlers on change', async () => {
            const conn = mockConnection({ ansible: { path: 'old' } });
            const sm = new SettingsManager(conn as never, true);

            const handler = vi.fn();
            sm.onConfigurationChanged('file:///ws', handler);

            await sm.get('file:///ws');

            conn.workspace.getConfiguration.mockResolvedValueOnce({
                ansible: { path: 'new' },
            });

            await sm.handleConfigurationChanged({ settings: {} });
            expect(handler).toHaveBeenCalled();
        });

        it('handleConfigurationChanged skips handler when config unchanged', async () => {
            const conn = mockConnection({});
            const sm = new SettingsManager(conn as never, true);

            const handler = vi.fn();
            sm.onConfigurationChanged('file:///ws', handler);

            const mergedSettings = await sm.get('file:///ws');
            conn.workspace.getConfiguration.mockResolvedValueOnce(
                JSON.parse(JSON.stringify(mergedSettings)),
            );

            await sm.handleConfigurationChanged({ settings: {} });
            expect(handler).not.toHaveBeenCalled();
        });

        // Source returns `{} as ExtensionSettings` when connection is null and
        // no cached settings exist — callers must guard against this edge case.
        it('get() returns empty object when no connection and no cache', async () => {
            const sm = new SettingsManager(null, true);
            const settings = await sm.get('file:///doc.yml');
            expect(settings).toEqual({});
        });
    });

    describe('onConfigurationChanged', () => {
        it('registers and invokes change handlers', async () => {
            const sm = new SettingsManager(null, false);
            const handler = vi.fn();
            sm.onConfigurationChanged('file:///ws', handler);

            await sm.handleConfigurationChanged({
                settings: { ansible: sm.globalSettings },
            });
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });
});
