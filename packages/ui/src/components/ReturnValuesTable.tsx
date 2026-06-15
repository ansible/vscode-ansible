import type { CSSProperties } from 'react';
import type { PluginReturn } from '../bridge/plugin-doc';
import { formatAnsibleMarkup, toArray } from '../utils/ansible-markup';

interface ReturnValuesTableProps {
    returnValues: PluginReturn;
}

const styles: Record<string, CSSProperties> = {
    tree: {
        fontSize: '12px',
    },
    item: {
        borderBottom: '1px solid var(--ui-border)',
        padding: '8px 0',
    },
    name: {
        fontFamily: 'var(--ui-font-mono)',
        fontWeight: 600,
        color: 'var(--ui-text-primary)',
    },
    meta: {
        fontSize: '11px',
        color: 'var(--ui-text-secondary)',
        marginTop: 2,
    },
    desc: {
        color: 'var(--ui-text-primary)',
        fontSize: '12px',
        marginTop: 4,
    },
    descParagraph: {
        margin: '0 0 4px 0',
    },
    sample: {
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        padding: '6px 10px',
        borderRadius: 3,
        fontFamily: 'var(--ui-font-mono)',
        fontSize: '11px',
        marginTop: 6,
        overflowX: 'auto',
        whiteSpace: 'pre',
        color: 'var(--ui-text-primary)',
    },
    empty: {
        color: 'var(--ui-text-muted)',
        fontStyle: 'italic',
        fontSize: '12px',
    },
};

/**
 * Render documented return values for a plugin.
 * @param root0 - Component props.
 * @param root0.returnValues - Return value schema map from plugin documentation.
 * @returns The rendered return values table.
 */
export function ReturnValuesTable({ returnValues }: ReturnValuesTableProps) {
    const entries = Object.entries(returnValues);

    if (entries.length === 0) {
        return <div style={styles.empty}>No return values documented</div>;
    }

    return (
        <div style={styles.tree}>
            {entries.map(([name, val]) => (
                <div key={name} style={styles.item}>
                    <div style={styles.name}>{name}</div>
                    <div style={styles.meta}>
                        {val.type ?? 'unknown'} — returned when: {val.returned ?? 'always'}
                    </div>
                    <div style={styles.desc}>
                        {toArray(val.description).map((paragraph, i) => (
                            <p
                                key={i}
                                style={styles.descParagraph}
                                dangerouslySetInnerHTML={{
                                    __html: formatAnsibleMarkup(paragraph),
                                }}
                            />
                        ))}
                    </div>
                    {val.sample !== undefined && (
                        <pre style={styles.sample}>{JSON.stringify(val.sample, null, 2)}</pre>
                    )}
                </div>
            ))}
        </div>
    );
}
