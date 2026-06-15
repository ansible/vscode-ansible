import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { parseExamples } from '../utils/example-parser';
import { YamlBlock } from './YamlBlock';

interface ExamplesViewProps {
    examples: string;
    onCopy?: (text: string) => void;
}

type ViewMode = 'formatted' | 'raw';

const styles: Record<string, CSSProperties> = {
    toolbar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    toggle: {
        display: 'flex',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    toggleBtn: {
        background: 'transparent',
        border: 'none',
        color: 'var(--ui-text-muted)',
        padding: '6px 12px',
        fontSize: '11px',
        fontFamily: 'var(--ui-font-family)',
        cursor: 'pointer',
    },
    toggleBtnActive: {
        background: 'var(--ui-bg-active)',
        color: 'var(--ui-text-primary)',
    },
    section: {
        marginBottom: 16,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderBottom: 'none',
        borderRadius: '4px 4px 0 0',
        padding: '8px 12px',
    },
    title: {
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--ui-text-primary)',
    },
    context: {
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderTop: 'none',
        padding: '8px 12px',
        fontFamily: 'var(--ui-font-mono)',
        fontSize: '11px',
        color: 'var(--ui-text-muted)',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.5,
    },
    contextLabel: {
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: 4,
        color: 'var(--ui-text-secondary)',
    },
    codeWrapper: {
        overflow: 'hidden',
    },
};

/**
 * Render plugin examples with formatted section parsing or raw YAML view.
 * @param root0 - Component props.
 * @param root0.examples - Raw examples text from plugin documentation.
 * @param root0.onCopy - Optional callback invoked when example YAML is copied.
 * @returns The rendered examples view.
 */
export function ExamplesView({ examples, onCopy }: ExamplesViewProps) {
    const sections = useMemo(() => parseExamples(examples), [examples]);
    const [viewMode, setViewMode] = useState<ViewMode>('formatted');

    if (sections.length === 0) {
        return <YamlBlock yaml={examples} copyable onCopy={onCopy} />;
    }

    return (
        <div>
            <div style={styles.toolbar}>
                <div style={styles.toggle}>
                    <button
                        type="button"
                        style={{
                            ...styles.toggleBtn,
                            ...(viewMode === 'formatted' ? styles.toggleBtnActive : {}),
                        }}
                        onClick={() => {
                            setViewMode('formatted');
                        }}
                    >
                        Formatted
                    </button>
                    <button
                        type="button"
                        style={{
                            ...styles.toggleBtn,
                            ...(viewMode === 'raw' ? styles.toggleBtnActive : {}),
                        }}
                        onClick={() => {
                            setViewMode('raw');
                        }}
                    >
                        Raw
                    </button>
                </div>
            </div>

            {viewMode === 'raw' ? (
                <YamlBlock yaml={examples} copyable onCopy={onCopy} />
            ) : (
                sections.map((section, index) => (
                    <div key={index} style={styles.section}>
                        <div style={styles.header}>
                            <span style={styles.title}>{section.title}</span>
                        </div>

                        {section.beforeState && (
                            <div style={styles.context}>
                                <div style={styles.contextLabel}>Before state:</div>
                                {section.beforeState}
                            </div>
                        )}

                        <div style={styles.codeWrapper}>
                            <YamlBlock yaml={section.task} copyable onCopy={onCopy} />
                        </div>

                        {section.taskOutput && (
                            <div style={styles.context}>
                                <div style={styles.contextLabel}>Task Output:</div>
                                {section.taskOutput}
                            </div>
                        )}

                        {section.afterState && (
                            <div style={styles.context}>
                                <div style={styles.contextLabel}>After state:</div>
                                {section.afterState}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
