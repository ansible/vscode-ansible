import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PluginOption } from '../bridge/plugin-doc';
import { generateSampleYaml } from '../utils/sample-task';
import type { CommentMode } from '../utils/sample-task';
import { YamlBlock } from './YamlBlock';

interface SampleTaskViewProps {
    fqcn: string;
    options: Record<string, PluginOption>;
    onCopy?: (text: string) => void;
}

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
};

const MODES: { id: CommentMode; label: string }[] = [
    { id: 'none', label: 'No Comments' },
    { id: 'optional', label: 'Minimal' },
    { id: 'descriptions', label: 'Documented' },
];

/**
 * Render generated sample task YAML with selectable comment modes.
 * @param root0 - Component props.
 * @param root0.fqcn - Fully qualified plugin name.
 * @param root0.options - Parameter schema map for the plugin.
 * @param root0.onCopy - Optional callback invoked when sample YAML is copied.
 * @returns The rendered sample task view.
 */
export function SampleTaskView({ fqcn, options, onCopy }: SampleTaskViewProps) {
    const [commentMode, setCommentMode] = useState<CommentMode>('optional');

    const yamlByMode = useMemo(
        () => ({
            none: generateSampleYaml(fqcn, options, 'none'),
            optional: generateSampleYaml(fqcn, options, 'optional'),
            descriptions: generateSampleYaml(fqcn, options, 'descriptions'),
        }),
        [fqcn, options],
    );

    const activeYaml = yamlByMode[commentMode];

    const handleModeChange = useCallback((mode: CommentMode) => {
        setCommentMode(mode);
    }, []);

    return (
        <div>
            <div style={styles.toolbar}>
                <div style={styles.toggle}>
                    {MODES.map((mode) => (
                        <button
                            key={mode.id}
                            type="button"
                            style={{
                                ...styles.toggleBtn,
                                ...(commentMode === mode.id ? styles.toggleBtnActive : {}),
                            }}
                            onClick={() => {
                                handleModeChange(mode.id);
                            }}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
            </div>
            <YamlBlock yaml={activeYaml} copyable onCopy={onCopy} />
        </div>
    );
}
