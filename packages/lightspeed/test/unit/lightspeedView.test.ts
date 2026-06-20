import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
    EventEmitter: class MockEventEmitter<T> {
        private listeners: ((value: T) => void)[] = [];
        event = (listener: (value: T) => void) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
        fire(value: T) {
            for (const listener of this.listeners) listener(value);
        }
        dispose() {}
    },
    TreeItem: class MockTreeItem {
        label: string;
        collapsibleState: number;
        command?: unknown;
        iconPath?: unknown;
        constructor(label: string, collapsibleState: number) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class MockThemeIcon {
        constructor(public id: string) {}
    },
}));

import { LightspeedViewProvider } from '../../src/views/lightspeedView';

describe('LightspeedViewProvider', () => {
    let provider: LightspeedViewProvider;

    beforeEach(() => {
        provider = new LightspeedViewProvider();
    });

    describe('getChildren', () => {
        it('shows sign-in item when not authenticated', () => {
            const children = provider.getChildren();

            expect(children).toHaveLength(1);
            expect(children[0].label).toBe('Sign in to Ansible Lightspeed');
            expect(children[0].command?.command).toBe('ansible.lightspeed.oauth');
        });

        it('shows feature items when authenticated', () => {
            provider.refresh(true);
            const children = provider.getChildren();

            expect(children).toHaveLength(4);
            expect(children[0].label).toBe('Generate Playbook');
            expect(children[1].label).toBe('Generate Role');
            expect(children[2].label).toBe('Explain Playbook');
            expect(children[3].label).toBe('Explain Role');
        });

        it('reverts to sign-in when session is cleared', () => {
            provider.refresh(true);
            expect(provider.getChildren()).toHaveLength(4);

            provider.refresh(false);
            const children = provider.getChildren();
            expect(children).toHaveLength(1);
            expect(children[0].label).toBe('Sign in to Ansible Lightspeed');
        });
    });

    describe('getTreeItem', () => {
        it('returns the element as-is', () => {
            const children = provider.getChildren();
            const item = provider.getTreeItem(children[0]);
            expect(item).toBe(children[0]);
        });
    });

    describe('onDidChangeTreeData', () => {
        it('fires when refresh is called', () => {
            const listener = vi.fn();
            provider.onDidChangeTreeData(listener);

            provider.refresh(true);

            expect(listener).toHaveBeenCalledWith(undefined);
        });
    });
});
