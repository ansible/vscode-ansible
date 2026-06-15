import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';

export interface PackageItem {
    name: string;
    version: string;
    summary?: string;
}

interface PackageListProps {
    packages: PackageItem[];
    title: string;
    icon?: string;
}

const styles: Record<string, CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
    },
    searchRow: {
        padding: '8px 12px',
        borderBottom: '1px solid var(--ui-border)',
    },
    searchInput: {
        width: '100%',
        padding: '4px 8px',
        border: '1px solid var(--ui-border)',
        borderRadius: 3,
        background: 'var(--ui-bg-surface)',
        color: 'var(--ui-text-primary)',
        fontFamily: 'var(--ui-font-family)',
        fontSize: 'var(--ui-font-size)',
        outline: 'none',
    },
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '4px 12px',
        borderBottom: '1px solid var(--ui-border)',
    },
    rowAlt: {
        background: 'var(--ui-bg-surface)',
    },
    name: {
        fontFamily: 'var(--ui-font-mono)',
        fontSize: '12px',
        color: 'var(--ui-text-primary)',
        flexShrink: 0,
    },
    version: {
        fontFamily: 'var(--ui-font-mono)',
        fontSize: '12px',
        color: 'var(--ui-text-secondary)',
        textAlign: 'right' as const,
        marginLeft: 12,
    },
    summary: {
        fontSize: '11px',
        color: 'var(--ui-text-muted)',
        marginTop: 2,
    },
    count: {
        fontSize: '12px',
        color: 'var(--ui-text-secondary)',
        padding: '6px 12px',
        borderBottom: '1px solid var(--ui-border)',
    },
    empty: {
        padding: '16px 12px',
        color: 'var(--ui-text-muted)',
        fontStyle: 'italic',
    },
};

/**
 * Sortable, searchable package list. Reusable for system packages,
 * Python packages, and Ansible collections.
 * @param root0 - Component props.
 * @param root0.packages - Array of package items to display.
 * @param root0.title - Heading label for the list (e.g. "System Packages").
 * @returns The rendered package list.
 */
export function PackageList({ packages, title }: PackageListProps) {
    const [filter, setFilter] = useState('');

    const filtered = useMemo(() => {
        if (!filter) return packages;
        const lower = filter.toLowerCase();
        return packages.filter(
            (p) => p.name.toLowerCase().includes(lower) || p.version.toLowerCase().includes(lower),
        );
    }, [packages, filter]);

    return (
        <div style={styles.container}>
            <div style={styles.count}>
                {filtered.length === packages.length
                    ? `${String(packages.length)} ${title}`
                    : `${String(filtered.length)} of ${String(packages.length)} ${title}`}
            </div>
            {packages.length > 10 && (
                <div style={styles.searchRow}>
                    <input
                        type="text"
                        placeholder={`Filter ${title.toLowerCase()}…`}
                        value={filter}
                        onChange={(e) => {
                            setFilter(e.target.value);
                        }}
                        style={styles.searchInput}
                    />
                </div>
            )}
            {filtered.length === 0 ? (
                <div style={styles.empty}>
                    {packages.length === 0 ? `No ${title.toLowerCase()} found` : 'No matches'}
                </div>
            ) : (
                filtered.map((pkg, i) => (
                    <div
                        key={pkg.name}
                        style={{ ...styles.row, ...(i % 2 === 1 ? styles.rowAlt : {}) }}
                    >
                        <div>
                            <span style={styles.name}>{pkg.name}</span>
                            {pkg.summary && <div style={styles.summary}>{pkg.summary}</div>}
                        </div>
                        <span style={styles.version}>{pkg.version}</span>
                    </div>
                ))
            )}
        </div>
    );
}
