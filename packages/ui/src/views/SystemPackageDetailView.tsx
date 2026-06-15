import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { EEBridge, SystemPackageDetail } from '../bridge/ee';
import { InfoList } from '../components/InfoList';
import type { InfoItem } from '../components/InfoList';

interface SystemPackageDetailViewProps {
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
    description: {
        marginTop: 12,
        fontSize: '13px',
        color: 'var(--ui-text-primary)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
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
};

/**
 * Detail view for a single system package inside an execution environment.
 * @param root0 - Component props.
 * @param root0.eeName - Full image name of the execution environment.
 * @param root0.packageName - Name of the system package to display.
 * @returns The rendered system package detail view.
 */
export function SystemPackageDetailView({ eeName, packageName }: SystemPackageDetailViewProps) {
    const bridge = useBridge() as EEBridge;
    const [data, setData] = useState<SystemPackageDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const detail = await bridge.getSystemPackageDetail(eeName, packageName);
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
    if (data.arch) metadata.push({ label: 'Architecture', value: data.arch });
    if (data.license) metadata.push({ label: 'License', value: data.license });
    if (data.size) metadata.push({ label: 'Size', value: data.size });
    if (data.release) metadata.push({ label: 'Release', value: data.release });

    return (
        <div style={styles.container} className="ansible-ui">
            <div style={styles.header}>
                <h2 style={styles.title}>
                    {data.name}
                    <span style={styles.badge}>{data.version}</span>
                    {data.arch && <span style={styles.badge}>{data.arch}</span>}
                </h2>
                {data.description && <div style={styles.description}>{data.description}</div>}
            </div>

            {(metadata.length > 0 || data.url) && (
                <div style={styles.section}>
                    <div style={styles.sectionTitle}>Metadata</div>
                    <InfoList items={metadata} />
                    {data.url && (
                        <div style={{ padding: '6px 12px' }}>
                            <a
                                href={data.url}
                                style={styles.link}
                                title={data.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {data.url}
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
