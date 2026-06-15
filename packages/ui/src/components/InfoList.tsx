import type { CSSProperties } from 'react';

export interface InfoItem {
    label: string;
    value: string;
}

interface InfoListProps {
    items: InfoItem[];
}

const styles: Record<string, CSSProperties> = {
    row: {
        display: 'flex',
        padding: '6px 12px',
        borderBottom: '1px solid var(--ui-border)',
        gap: 12,
    },
    label: {
        fontSize: '12px',
        color: 'var(--ui-text-secondary)',
        minWidth: 80,
        flexShrink: 0,
    },
    value: {
        fontSize: '12px',
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-primary)',
        wordBreak: 'break-all',
    },
};

/**
 * Key-value info display used for EE metadata (ansible version, OS, image name).
 * @param root0 - Component props.
 * @param root0.items - Array of label/value pairs to display.
 * @returns The rendered info list.
 */
export function InfoList({ items }: InfoListProps) {
    return (
        <div>
            {items.map((item) => (
                <div key={item.label} style={styles.row}>
                    <span style={styles.label}>{item.label}</span>
                    <span style={styles.value}>{item.value}</span>
                </div>
            ))}
        </div>
    );
}
