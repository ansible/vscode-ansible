import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { highlightYaml } from '../utils/yaml-highlight';

interface YamlBlockProps {
    yaml: string;
    copyable?: boolean;
    onCopy?: (text: string) => void | Promise<void>;
}

const YAML_HIGHLIGHT_CSS = `
.yaml-key { color: var(--ui-yaml-key, #9cdcfe); }
.yaml-string { color: var(--ui-yaml-string, #ce9178); }
.yaml-number { color: var(--ui-yaml-number, #b5cea8); }
.yaml-bool { color: var(--ui-yaml-bool, #569cd6); }
.yaml-null { color: var(--ui-yaml-null, #569cd6); }
.yaml-comment { color: var(--ui-yaml-comment, #6a9955); }
.yaml-comment-dim { color: var(--ui-yaml-comment-dim, #5a7a4a); }
.yaml-comment-type { color: var(--ui-yaml-comment-type, #dcdcaa); }
.yaml-comment-required { color: var(--ui-yaml-comment-required, #f44747); }
.yaml-comment-optional { color: var(--ui-yaml-comment-optional, #6a9955); }
.yaml-list-marker { color: var(--ui-yaml-list-marker, #d4d4d4); }
`;

const styles: Record<string, CSSProperties> = {
    container: {
        position: 'relative',
    },
    pre: {
        margin: 0,
        padding: '10px 12px',
        fontFamily: 'var(--ui-font-mono)',
        fontSize: '12px',
        lineHeight: 1.5,
        whiteSpace: 'pre',
        overflowX: 'auto',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 4,
        color: 'var(--ui-text-primary)',
    },
    copyBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        padding: '2px 8px',
        fontSize: '11px',
        fontFamily: 'var(--ui-font-family)',
        color: 'var(--ui-text-secondary)',
        background: 'var(--ui-bg-primary)',
        border: '1px solid var(--ui-border)',
        borderRadius: 3,
        cursor: 'pointer',
    },
    copyBtnCopied: {
        color: 'var(--ui-success)',
        borderColor: 'var(--ui-success)',
    },
};

/**
 * Presentational YAML block with syntax highlighting and optional copy button.
 * @param root0 - Component props.
 * @param root0.yaml - YAML text to render.
 * @param root0.copyable - Whether to show a copy button.
 * @param root0.onCopy - Optional callback invoked after copying YAML text.
 * @returns The rendered YAML block.
 */
export function YamlBlock({ yaml, copyable = false, onCopy }: YamlBlockProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!document.getElementById('yaml-highlight-styles')) {
            const style = document.createElement('style');
            style.id = 'yaml-highlight-styles';
            style.textContent = YAML_HIGHLIGHT_CSS;
            document.head.appendChild(style);
        }
    }, []);

    const handleCopy = useCallback(() => {
        const result = onCopy ? onCopy(yaml) : navigator.clipboard.writeText(yaml);
        if (result instanceof Promise) {
            void result;
        }
        setCopied(true);
        setTimeout(() => {
            setCopied(false);
        }, 2000);
    }, [yaml, onCopy]);

    const highlighted = highlightYaml(yaml);

    return (
        <div style={styles.container}>
            {copyable && (
                <button
                    type="button"
                    style={{
                        ...styles.copyBtn,
                        ...(copied ? styles.copyBtnCopied : {}),
                    }}
                    onClick={handleCopy}
                >
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            )}
            <pre style={styles.pre} dangerouslySetInnerHTML={{ __html: highlighted }} />
        </div>
    );
}
