import { useState, useCallback } from 'react';
import type { CSSProperties } from 'react';

interface FormListBuilderProps {
    label: string;
    items: string[];
    onChange: (items: string[]) => void;
    description?: string;
    defaultValue?: string;
    required?: boolean;
    placeholder?: string;
}

/**
 * List builder that lets users add/remove string items one at a time.
 * Replaces raw JSON array display for repeatable CLI parameters.
 * @param root0 - Component props.
 * @param root0.label - Field label shown above the input.
 * @param root0.items - Current list of string values.
 * @param root0.onChange - Callback invoked with the updated items array.
 * @param root0.description - Optional help text below the list.
 * @param root0.defaultValue - Optional default value shown as hint text.
 * @param root0.required - Whether to show a required indicator.
 * @param root0.placeholder - Optional placeholder text for the input.
 * @returns The rendered list builder field.
 */
export function FormListBuilder({
    label,
    items,
    onChange,
    description,
    defaultValue,
    required,
    placeholder,
}: FormListBuilderProps) {
    const [draft, setDraft] = useState('');

    const addItem = useCallback(() => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        onChange([...items, trimmed]);
        setDraft('');
    }, [draft, items, onChange]);

    const removeItem = useCallback(
        (index: number) => {
            onChange(items.filter((_, i) => i !== index));
        },
        [items, onChange],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
            }
        },
        [addItem],
    );

    const styles: Record<string, CSSProperties> = {
        group: { marginBottom: 20 },
        label: {
            display: 'block',
            marginBottom: 6,
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--ui-text-primary)',
        },
        required: {
            color: 'var(--ui-error, var(--vscode-errorForeground, #f44))',
            marginLeft: 4,
        },
        inputRow: {
            display: 'flex',
            gap: 6,
        },
        input: {
            flex: 1,
            padding: '6px 10px',
            background: 'var(--ui-input-bg, var(--vscode-input-background))',
            color: 'var(--ui-input-fg, var(--vscode-input-foreground))',
            border: '1px solid var(--ui-input-border, var(--vscode-input-border, var(--ui-border, #444)))',
            borderRadius: 4,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box' as const,
        },
        addBtn: {
            padding: '6px 12px',
            background: 'var(--ui-accent, var(--vscode-button-background, #007acc))',
            color: 'var(--ui-accent-fg, var(--vscode-button-foreground, #fff))',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
        },
        list: {
            listStyle: 'none',
            margin: '8px 0 0',
            padding: 0,
        },
        item: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            marginBottom: 4,
            background: 'var(--ui-bg-surface, var(--vscode-editor-background))',
            border: '1px solid var(--ui-border, var(--vscode-widget-border, #333))',
            borderRadius: 4,
            fontSize: 13,
        },
        itemText: {
            flex: 1,
            fontFamily: 'var(--vscode-editor-font-family, monospace)',
            fontSize: 12,
            wordBreak: 'break-all',
        },
        removeBtn: {
            background: 'transparent',
            border: 'none',
            color: 'var(--ui-text-secondary)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 3,
        },
        help: {
            fontSize: 11,
            color: 'var(--ui-text-secondary)',
            marginTop: 6,
            lineHeight: 1.4,
        },
        default: {
            fontSize: 11,
            color: 'var(--ui-text-secondary)',
            fontStyle: 'italic',
            marginTop: 4,
        },
    };

    return (
        <div style={styles.group}>
            <label style={styles.label}>
                {label}
                {required && <span style={styles.required}>*</span>}
            </label>
            <div style={styles.inputRow}>
                <input
                    type="text"
                    style={styles.input}
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder ?? 'Type a value and press Enter or Add'}
                    onFocus={(e) => {
                        e.target.style.borderColor =
                            'var(--ui-input-focus-border, var(--vscode-focusBorder, #007acc))';
                    }}
                    onBlur={(e) => {
                        e.target.style.borderColor =
                            'var(--ui-input-border, var(--vscode-input-border, var(--ui-border, #444)))';
                    }}
                />
                <button type="button" style={styles.addBtn} onClick={addItem}>
                    Add
                </button>
            </div>
            {items.length > 0 && (
                <ul style={styles.list}>
                    {items.map((item, idx) => (
                        <li key={`${String(idx)}-${item}`} style={styles.item}>
                            <span style={styles.itemText}>{item}</span>
                            <button
                                type="button"
                                style={styles.removeBtn}
                                onClick={() => {
                                    removeItem(idx);
                                }}
                                title="Remove"
                            >
                                &times;
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {description && <div style={styles.help}>{description}</div>}
            {defaultValue !== undefined && (
                <div style={styles.default}>Default: {defaultValue}</div>
            )}
        </div>
    );
}
