import type { CSSProperties, ReactNode } from 'react';

export interface Tab {
    id: string;
    label: string;
    count?: number;
}

interface TabBarProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    children: ReactNode;
}

const styles: Record<string, CSSProperties> = {
    bar: {
        display: 'flex',
        borderBottom: '1px solid var(--ui-border)',
        background: 'var(--ui-bg-surface)',
        gap: 0,
        overflow: 'hidden',
    },
    tab: {
        padding: '8px 16px',
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'var(--ui-font-family)',
        color: 'var(--ui-text-secondary)',
        background: 'transparent',
        border: 'none',
        borderBottom: '2px solid transparent',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
    },
    tabActive: {
        color: 'var(--ui-text-primary)',
        borderBottomColor: 'var(--ui-accent)',
    },
    badge: {
        marginLeft: 6,
        fontSize: '11px',
        color: 'var(--ui-text-muted)',
    },
    content: {
        flex: 1,
        overflow: 'auto',
    },
};

/**
 * Simple tab bar with content area. Used for EE detail sections
 * and any other tabbed layout in shared views.
 * @param root0 - Component props.
 * @param root0.tabs - Tab definitions with id, label, and optional count.
 * @param root0.activeTab - ID of the currently active tab.
 * @param root0.onTabChange - Callback invoked when a tab is clicked.
 * @param root0.children - Content rendered below the tab bar.
 * @returns The rendered tab bar with content.
 */
export function TabBar({ tabs, activeTab, onTabChange, children }: TabBarProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={styles.bar}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        style={{
                            ...styles.tab,
                            ...(activeTab === tab.id ? styles.tabActive : {}),
                        }}
                        onClick={() => {
                            onTabChange(tab.id);
                        }}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span style={styles.badge}>({String(tab.count)})</span>
                        )}
                    </button>
                ))}
            </div>
            <div style={styles.content}>{children}</div>
        </div>
    );
}
