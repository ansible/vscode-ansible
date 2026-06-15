import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { EEBridge, PythonPackageDetail } from '../bridge/ee';
import { InfoList } from '../components/InfoList';
import type { InfoItem } from '../components/InfoList';

interface PythonPackageDetailViewProps {
    eeName: string;
    packageName: string;
}

const styles: Record<string, CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ui-bg-primary)',
        overflow: 'auto',
    },
    header: {
        padding: '16px',
        borderBottom: '1px solid var(--ui-border)',
    },
    title: {
        fontSize: '16px',
        fontWeight: 600,
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-primary)',
        margin: 0,
    },
    badge: {
        display: 'inline-block',
        marginLeft: 8,
        padding: '2px 8px',
        fontSize: '12px',
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-secondary)',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 3,
    },
    summary: {
        marginTop: 8,
        fontSize: '13px',
        color: 'var(--ui-text-secondary)',
        lineHeight: 1.5,
    },
    section: {
        padding: '12px 16px',
        borderBottom: '1px solid var(--ui-border)',
    },
    sectionTitle: {
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--ui-text-secondary)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: 8,
    },
    depList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: 0,
        margin: 0,
        listStyle: 'none',
    },
    depItem: {
        padding: '2px 8px',
        fontSize: '12px',
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-primary)',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 3,
        cursor: 'pointer',
    },
    link: {
        color: 'var(--ui-text-link)',
        textDecoration: 'none',
        fontSize: '12px',
        fontFamily: 'var(--ui-font-mono)',
    },
    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        color: 'var(--ui-text-secondary)',
        fontSize: '13px',
    },
    error: {
        padding: '16px',
        color: 'var(--ui-error)',
        fontSize: '13px',
    },
    emptyDeps: {
        fontSize: '12px',
        color: 'var(--ui-text-muted)',
        fontStyle: 'italic',
    },
};

/**
 * Detail view for a single Python package inside an execution environment.
 * @param root0 - Component props.
 * @param root0.eeName - Full image name of the execution environment.
 * @param root0.packageName - Name of the Python package to display.
 * @returns The rendered Python package detail view.
 */
export function PythonPackageDetailView({ eeName, packageName }: PythonPackageDetailViewProps) {
    const bridge = useBridge() as EEBridge;
    const [data, setData] = useState<PythonPackageDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const detail = await bridge.getPythonPackageDetail(eeName, packageName);
            if (!detail) {
                setError(`Package "${packageName}" not found`);
            } else {
                setData(detail);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [bridge, eeName, packageName]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    if (loading) {
        return <div style={styles.loading}>Loading package details…</div>;
    }

    if (error) {
        return <div style={styles.error}>Error: {error}</div>;
    }

    if (!data) {
        return <div style={styles.loading}>No data available</div>;
    }

    const metadata: InfoItem[] = [];
    if (data.author) metadata.push({ label: 'Author', value: data.author });
    if (data.license) metadata.push({ label: 'License', value: data.license });
    if (data.location) metadata.push({ label: 'Location', value: data.location });

    return (
        <div style={styles.container} className="ansible-ui">
            <div style={styles.header}>
                <h2 style={styles.title}>
                    {data.name}
                    <span style={styles.badge}>{data.version}</span>
                </h2>
                {data.summary && <div style={styles.summary}>{data.summary}</div>}
            </div>

            {(metadata.length > 0 || data.homepage) && (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Metadata</div>
                    <InfoList items={metadata} />
                    {data.homepage && (
                        <div style={{ padding: '6px 12px' }}>
                            <a
                                href={data.homepage}
                                style={styles.link}
                                title={data.homepage}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {data.homepage}
                            </a>
                        </div>
                    )}
                </div>
            )}

            <div style={styles.section}>
                <div style={styles.sectionTitle}>Dependencies ({String(data.requires.length)})</div>
                {data.requires.length > 0 ? (
                    <ul style={styles.depList}>
                        {data.requires.map((dep) => (
                            <li
                                key={dep}
                                style={styles.depItem}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    bridge.openPackageDetail(eeName, dep, 'python');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        bridge.openPackageDetail(eeName, dep, 'python');
                                    }
                                }}
                            >
                                {dep}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span style={styles.emptyDeps}>No dependencies</span>
                )}
            </div>

            <div style={styles.section}>
                <div style={styles.sectionTitle}>
                    Required By ({String(data.requiredBy.length)})
                </div>
                {data.requiredBy.length > 0 ? (
                    <ul style={styles.depList}>
                        {data.requiredBy.map((dep) => (
                            <li
                                key={dep}
                                style={styles.depItem}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    bridge.openPackageDetail(eeName, dep, 'python');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        bridge.openPackageDetail(eeName, dep, 'python');
                                    }
                                }}
                            >
                                {dep}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span style={styles.emptyDeps}>No reverse dependencies</span>
                )}
            </div>
        </div>
    );
}
