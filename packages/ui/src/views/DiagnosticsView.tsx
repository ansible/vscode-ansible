import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type {
    DiagnosticsBridge,
    DiagnosticsData,
    DiagnosticsTool,
    DiagnosticsService,
} from '../bridge/diagnostics';

const styles: Record<string, CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ui-bg-primary)',
        overflow: 'auto',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--ui-border)',
    },
    title: {
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--ui-text-primary)',
        margin: 0,
    },
    refreshBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        fontSize: '12px',
        color: 'var(--ui-text-primary)',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    body: {
        padding: '16px 20px',
    },
    section: {
        marginBottom: '24px',
    },
    sectionTitle: {
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        color: 'var(--ui-text-secondary)',
        margin: '0 0 10px 0',
    },
    card: {
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: '6px',
        padding: '12px 16px',
    },
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid var(--ui-border)',
    },
    rowLast: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
    },
    label: {
        fontSize: '13px',
        color: 'var(--ui-text-secondary)',
    },
    value: {
        fontSize: '13px',
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-primary)',
    },
    badge: {
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '10px',
        fontWeight: 500,
    },
    badgeOk: {
        background: 'color-mix(in srgb, var(--ui-success) 15%, transparent)',
        color: 'var(--ui-success)',
    },
    badgeWarn: {
        background: 'color-mix(in srgb, var(--ui-warning) 15%, transparent)',
        color: 'var(--ui-warning)',
    },
    toolGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '0',
    },
    toolName: {
        fontSize: '13px',
        color: 'var(--ui-text-primary)',
        padding: '6px 0',
        borderBottom: '1px solid var(--ui-border)',
    },
    toolVersion: {
        fontSize: '13px',
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-secondary)',
        padding: '6px 0',
        borderBottom: '1px solid var(--ui-border)',
        textAlign: 'right' as const,
    },
    actionLink: {
        fontSize: '12px',
        color: 'var(--ui-text-link)',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
        textDecoration: 'underline',
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
    empty: {
        color: 'var(--ui-text-muted)',
        fontSize: '13px',
        fontStyle: 'italic',
    },
};

/**
 * Render a small colored badge indicating status.
 * @param root0 - Component props.
 * @param root0.ok - Whether the status is positive.
 * @param root0.label - Text to display in the badge.
 * @returns A styled span element.
 */
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
    const style = ok
        ? { ...styles.badge, ...styles.badgeOk }
        : { ...styles.badge, ...styles.badgeWarn };
    return <span style={style}>{label}</span>;
}

/**
 * Render a two-column grid of tool names and versions.
 * @param root0 - Component props.
 * @param root0.tools - Array of tool entries from adt --version.
 * @returns A grid element or empty-state message.
 */
function ToolTable({ tools }: { tools: DiagnosticsTool[] }) {
    if (tools.length === 0) {
        return <p style={styles.empty}>ansible-dev-tools not found</p>;
    }
    return (
        <div style={styles.toolGrid}>
            {tools.map((tool, i) => {
                const isLast = i === tools.length - 1;
                const nameStyle = isLast
                    ? { ...styles.toolName, borderBottom: 'none' }
                    : styles.toolName;
                const verStyle = isLast
                    ? { ...styles.toolVersion, borderBottom: 'none' }
                    : styles.toolVersion;
                return (
                    <div key={tool.name} style={{ display: 'contents' }}>
                        <span style={nameStyle}>{tool.name}</span>
                        <span style={verStyle}>{tool.version}</span>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Render a list of service status entries.
 * @param root0 - Component props.
 * @param root0.services - Array of service status entries.
 * @returns A card with service name/status rows.
 */
function ServiceList({ services }: { services: DiagnosticsService[] }) {
    if (services.length === 0) {
        return <p style={styles.empty}>No services</p>;
    }
    return (
        <>
            {services.map((svc, i) => {
                const isLast = i === services.length - 1;
                const rowStyle = isLast ? styles.rowLast : styles.row;
                const ok = svc.status === 'running' || svc.status === 'configured';
                return (
                    <div key={svc.name} style={rowStyle}>
                        <span style={styles.label}>{svc.name}</span>
                        <StatusBadge ok={ok} label={svc.status} />
                    </div>
                );
            })}
        </>
    );
}

/**
 * Diagnostics view showing workspace, Python environment, Ansible runtime,
 * services, and dev tools inventory with a refresh button and actions.
 * @returns The rendered diagnostics view.
 */
export function DiagnosticsView() {
    const bridge = useBridge() as DiagnosticsBridge;
    const [data, setData] = useState<DiagnosticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await bridge.getDiagnostics();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [bridge]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    if (loading && !data) {
        return <div style={styles.loading}>Loading diagnostics…</div>;
    }

    if (error && !data) {
        return <div style={styles.error}>Error: {error}</div>;
    }

    if (!data) {
        return <div style={styles.loading}>No data available</div>;
    }

    const py = data.python;
    const ans = data.ansible;

    return (
        <div style={styles.container} className="ansible-ui">
            <div style={styles.header}>
                <h2 style={styles.title}>Ansible Diagnostics</h2>
                <button type="button" style={styles.refreshBtn} onClick={() => void loadData()}>
                    ↻ Refresh
                </button>
            </div>
            <div style={styles.body}>
                {/* Workspace */}
                {data.workspacePath && (
                    <div style={styles.section}>
                        <h3 style={styles.sectionTitle}>Workspace</h3>
                        <div style={styles.card}>
                            <div style={styles.rowLast}>
                                <span style={styles.label}>Path</span>
                                <span
                                    style={{
                                        ...styles.value,
                                        fontSize: '12px',
                                        wordBreak: 'break-all',
                                    }}
                                >
                                    {data.workspacePath}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Python Environment */}
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>Python Environment</h3>
                    <div style={styles.card}>
                        <div style={styles.row}>
                            <span style={styles.label}>Environment</span>
                            <span style={styles.value}>
                                {py.envName ?? <span style={styles.empty}>not selected</span>}
                            </span>
                        </div>
                        <div style={styles.row}>
                            <span style={styles.label}>Version</span>
                            <span style={styles.value}>{py.version ?? '—'}</span>
                        </div>
                        <div style={styles.row}>
                            <span style={styles.label}>Path</span>
                            <span
                                style={{
                                    ...styles.value,
                                    fontSize: '12px',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {py.path ?? '—'}
                            </span>
                        </div>
                        <div style={styles.rowLast}>
                            <span style={styles.label} />
                            <button
                                type="button"
                                style={styles.actionLink}
                                onClick={() => {
                                    bridge.changePythonEnvironment();
                                }}
                            >
                                Change environment
                            </button>
                        </div>
                    </div>
                </div>

                {/* Ansible Runtime */}
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>Ansible Runtime</h3>
                    <div style={styles.card}>
                        <div style={styles.rowLast}>
                            <span style={styles.label}>Ansible Core</span>
                            <span style={styles.value}>
                                {ans.version ? (
                                    <>
                                        {ans.version} <StatusBadge ok={true} label="installed" />
                                    </>
                                ) : (
                                    <StatusBadge ok={false} label="not found" />
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Services */}
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>Services</h3>
                    <div style={styles.card}>
                        <ServiceList services={data.services} />
                    </div>
                </div>

                {/* Dev Tools */}
                <div style={styles.section}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <h3 style={styles.sectionTitle}>Ansible Dev Tools</h3>
                        {data.tools.length > 0 && (
                            <button
                                type="button"
                                style={styles.actionLink}
                                onClick={() => {
                                    bridge.upgradeDevTools();
                                }}
                            >
                                Upgrade
                            </button>
                        )}
                    </div>
                    <div style={styles.card}>
                        <ToolTable tools={data.tools} />
                    </div>
                </div>

                {/* Actions */}
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>Actions</h3>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            style={styles.refreshBtn}
                            onClick={() => {
                                bridge.resyncMetadata();
                                void loadData();
                            }}
                        >
                            Refresh all data
                        </button>
                        <button
                            type="button"
                            style={styles.refreshBtn}
                            onClick={() => {
                                bridge.openOutput();
                            }}
                        >
                            Open Ansible Output
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
