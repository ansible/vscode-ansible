import { describe, it, expect } from 'vitest';
import { createMockExtensionContext } from '../helpers/mockContext';

describe('createMockExtensionContext', () => {
    it('creates a context with empty subscriptions', () => {
        const ctx = createMockExtensionContext();
        expect(ctx.subscriptions).toEqual([]);
    });

    it('supports pushing disposables onto subscriptions', () => {
        const ctx = createMockExtensionContext();
        const disposable = { dispose: () => {} };
        ctx.subscriptions.push(disposable);
        expect(ctx.subscriptions).toHaveLength(1);
    });

    it('workspaceState stores and retrieves values', async () => {
        const ctx = createMockExtensionContext();
        await ctx.workspaceState.update('key', 'value');
        expect(ctx.workspaceState.get('key')).toBe('value');
    });

    it('workspaceState returns default for missing keys', () => {
        const ctx = createMockExtensionContext();
        expect(ctx.workspaceState.get('missing', 'default')).toBe('default');
    });

    it('globalState has setKeysForSync', () => {
        const ctx = createMockExtensionContext();
        expect(typeof ctx.globalState.setKeysForSync).toBe('function');
    });

    it('secrets stores, retrieves, and deletes', async () => {
        const ctx = createMockExtensionContext();
        await ctx.secrets.store('token', 'abc123');
        expect(await ctx.secrets.get('token')).toBe('abc123');
        await ctx.secrets.delete('token');
        expect(await ctx.secrets.get('token')).toBeUndefined();
    });

    it('accepts overrides', () => {
        const ctx = createMockExtensionContext({
            extensionPath: '/custom/path',
        });
        expect(ctx.extensionPath).toBe('/custom/path');
    });
});
