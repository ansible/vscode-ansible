import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { PluginDocBridge, PluginData, PluginDoc } from '../bridge/plugin-doc';
import { formatAnsibleMarkup, toArray } from '../utils/ansible-markup';
import { TabBar } from '../components/TabBar';
import type { Tab } from '../components/TabBar';
import { ParameterTree } from '../components/ParameterTree';
import { SampleTaskView } from '../components/SampleTaskView';
import { ExamplesView } from '../components/ExamplesView';
import { ReturnValuesTable } from '../components/ReturnValuesTable';

interface PluginDocViewProps {
    fqcn: string;
    pluginType: string;
}

const styles: Record<string, CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ui-bg-primary)',
        overflow: 'hidden',
    },
    toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        background: 'var(--ui-bg-surface)',
        borderBottom: '1px solid var(--ui-border)',
        flexShrink: 0,
    },
    toolbarBtn: {
        background: 'transparent',
        border: '1px solid var(--ui-border)',
        color: 'var(--ui-text-primary)',
        borderRadius: 3,
        padding: '2px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'var(--ui-font-family)',
    },
    toolbarDivider: {
        width: 1,
        height: 16,
        background: 'var(--ui-border)',
        margin: '0 4px',
    },
    zoomLabel: {
        fontSize: '11px',
        color: 'var(--ui-text-secondary)',
        minWidth: 36,
        textAlign: 'center' as const,
    },
    scrollArea: {
        flex: 1,
        overflow: 'auto',
    },
    breadcrumb: {
        padding: '12px 16px 0',
        fontSize: '12px',
        color: 'var(--ui-text-secondary)',
    },
    breadcrumbSep: {
        margin: '0 6px',
        color: 'var(--ui-text-muted)',
    },
    header: {
        padding: '8px 16px 12px',
        borderBottom: '1px solid var(--ui-border)',
    },
    headerRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-primary)',
        margin: 0,
    },
    typeBadge: {
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: '11px',
        fontFamily: 'var(--ui-font-mono)',
        color: 'var(--ui-text-secondary)',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 3,
        textTransform: 'lowercase' as const,
    },
    shortDesc: {
        marginTop: 6,
        fontSize: '13px',
        color: 'var(--ui-text-secondary)',
        lineHeight: 1.5,
    },
    versionInfo: {
        marginTop: 4,
        fontSize: '11px',
        color: 'var(--ui-text-muted)',
    },
    section: {
        padding: '16px',
    },
    sectionTitle: {
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--ui-text-primary)',
        marginBottom: 10,
        margin: 0,
    },
    synopsisList: {
        margin: '8px 0',
        paddingLeft: 20,
        lineHeight: 1.7,
        color: 'var(--ui-text-primary)',
        fontSize: '13px',
    },
    notesList: {
        margin: '8px 0',
        paddingLeft: 20,
        lineHeight: 1.7,
        color: 'var(--ui-text-primary)',
        fontSize: '13px',
    },
    authorText: {
        fontSize: '13px',
        color: 'var(--ui-text-secondary)',
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
    aiBtn: {
        background: 'var(--ui-accent)',
        border: 'none',
        color: '#fff',
        borderRadius: 4,
        padding: '3px 10px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: 'var(--ui-font-family)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
    },
};

/**
 * Top-level plugin documentation view.
 * Fetches doc data via the bridge and composes tabs for synopsis,
 * parameters, sample task, notes, examples, and return values.
 * @param root0 - Component props.
 * @param root0.fqcn - Fully qualified collection name of the plugin.
 * @param root0.pluginType - Plugin type such as module or lookup.
 * @returns The rendered plugin documentation view.
 */
export function PluginDocView({ fqcn, pluginType }: PluginDocViewProps) {
    const bridge = useBridge() as PluginDocBridge;
    const [data, setData] = useState<PluginData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(100);
    const [activeTab, setActiveTab] = useState('synopsis');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await bridge.getPluginDoc(fqcn, pluginType);
            if (!result?.doc) {
                setError(`No documentation found for ${fqcn}`);
            } else {
                setData(result);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [bridge, fqcn, pluginType]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleZoom = useCallback(
        (delta: number) => {
            setZoom((prev) => {
                const next = Math.max(50, Math.min(200, prev + delta));
                void bridge.saveViewSettings({ zoom: next });
                return next;
            });
        },
        [bridge],
    );

    const handleCopy = useCallback(
        (text: string) => {
            void bridge.copyToClipboard(text);
        },
        [bridge],
    );

    const handleAiPrompt = useCallback(() => {
        const prompt = `Help me create an Ansible task using the ${fqcn} ${pluginType}, guiding me through the required and optional parameters. Use the build_ansible_task MCP tool to accomplish this.`;
        void bridge.openChat(prompt);
    }, [bridge, fqcn, pluginType]);

    if (loading) {
        return (
            <div style={styles.container} className="ansible-ui">
                <div style={styles.loading}>Loading documentation…</div>
            </div>
        );
    }

    if (error || !data?.doc) {
        return (
            <div style={styles.container} className="ansible-ui">
                <div style={styles.error}>Error: {error ?? 'No data available'}</div>
            </div>
        );
    }

    const doc: PluginDoc = data.doc;
    const parts = fqcn.split('.');
    const pluginName = parts.pop() ?? fqcn;
    const collection =
        parts.length >= 2
            ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
            : parts.join('.');
    const namespace = parts.length >= 2 ? parts.slice(0, -1).join('.') : '';

    const tabs: Tab[] = [
        { id: 'synopsis', label: 'Synopsis' },
        { id: 'parameters', label: 'Parameters' },
        { id: 'sample', label: 'Sample Task' },
    ];
    if (doc.notes) tabs.push({ id: 'notes', label: 'Notes' });
    if (data.examples) tabs.push({ id: 'examples', label: 'Examples' });
    if (data.return) tabs.push({ id: 'return', label: 'Return Values' });

    return (
        <div style={{ ...styles.container, zoom: `${String(zoom)}%` }} className="ansible-ui">
            <div style={styles.toolbar}>
                <button
                    style={styles.toolbarBtn}
                    title="Zoom out"
                    onClick={() => {
                        handleZoom(-10);
                    }}
                >
                    −
                </button>
                <span style={styles.zoomLabel}>{String(zoom)}%</span>
                <button
                    style={styles.toolbarBtn}
                    title="Zoom in"
                    onClick={() => {
                        handleZoom(10);
                    }}
                >
                    +
                </button>
                {bridge.enableAiFeatures && (
                    <>
                        <div style={styles.toolbarDivider} />
                        <button
                            style={styles.aiBtn}
                            title="AI-assisted task builder"
                            onClick={handleAiPrompt}
                        >
                            ✨ AI Task Builder
                        </button>
                    </>
                )}
            </div>

            <div style={styles.scrollArea}>
                <div style={styles.breadcrumb}>
                    {namespace && (
                        <>
                            <span>{namespace}</span>
                            <span style={styles.breadcrumbSep}>›</span>
                        </>
                    )}
                    <span>{collection}</span>
                    <span style={styles.breadcrumbSep}>›</span>
                    <span>{pluginType}</span>
                    <span style={styles.breadcrumbSep}>›</span>
                    <strong>{pluginName}</strong>
                </div>

                <div style={styles.header}>
                    <div style={styles.headerRow}>
                        <h1 style={styles.title}>{pluginName}</h1>
                        <span style={styles.typeBadge}>{pluginType}</span>
                    </div>
                    {doc.short_description && (
                        <div style={styles.shortDesc}>{doc.short_description}</div>
                    )}
                    {doc.version_added && (
                        <div style={styles.versionInfo}>Added in version {doc.version_added}</div>
                    )}
                </div>

                <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
                    {activeTab === 'synopsis' && <SynopsisTab doc={doc} />}
                    {activeTab === 'parameters' && (
                        <div style={styles.section}>
                            <ParameterTree options={doc.options ?? {}} />
                        </div>
                    )}
                    {activeTab === 'sample' && (
                        <div style={styles.section}>
                            <SampleTaskView
                                fqcn={fqcn}
                                options={doc.options ?? {}}
                                onCopy={handleCopy}
                            />
                        </div>
                    )}
                    {activeTab === 'notes' && doc.notes && (
                        <div style={styles.section}>
                            <h2 style={styles.sectionTitle}>Notes</h2>
                            <ul style={styles.notesList}>
                                {toArray(doc.notes).map((note, i) => (
                                    <li
                                        key={String(i)}
                                        dangerouslySetInnerHTML={{
                                            __html: formatAnsibleMarkup(note),
                                        }}
                                    />
                                ))}
                            </ul>
                        </div>
                    )}
                    {activeTab === 'examples' && data.examples && (
                        <div style={styles.section}>
                            <ExamplesView examples={data.examples} onCopy={handleCopy} />
                        </div>
                    )}
                    {activeTab === 'return' && data.return && (
                        <div style={styles.section}>
                            <ReturnValuesTable returnValues={data.return} />
                        </div>
                    )}
                </TabBar>
            </div>
        </div>
    );
}

/**
 * Synopsis tab content including description, requirements, and author.
 * @param root0 - Component props.
 * @param root0.doc - Plugin documentation data.
 * @returns The rendered synopsis section.
 */
function SynopsisTab({ doc }: { doc: PluginDoc }) {
    return (
        <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Synopsis</h2>
            <ul style={styles.synopsisList}>
                {toArray(doc.description).map((d, i) => (
                    <li
                        key={String(i)}
                        dangerouslySetInnerHTML={{ __html: formatAnsibleMarkup(d) }}
                    />
                ))}
            </ul>

            {doc.requirements && toArray(doc.requirements).length > 0 && (
                <>
                    <h2 style={{ ...styles.sectionTitle, marginTop: 16 }}>Requirements</h2>
                    <ul style={styles.synopsisList}>
                        {toArray(doc.requirements).map((r, i) => (
                            <li key={String(i)}>{r}</li>
                        ))}
                    </ul>
                </>
            )}

            {doc.author && toArray(doc.author).length > 0 && (
                <>
                    <h2 style={{ ...styles.sectionTitle, marginTop: 16 }}>Author</h2>
                    <div style={styles.authorText}>{toArray(doc.author).join(', ')}</div>
                </>
            )}
        </div>
    );
}
