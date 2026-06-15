import type { CSSProperties } from 'react';

interface FormSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
    description?: string;
    defaultValue?: string;
    required?: boolean;
    placeholder?: string;
}

/**
 * Dropdown select field with label, options, and optional empty placeholder.
 * @param root0 - Component props.
 * @param root0.label - Field label shown above the select.
 * @param root0.value - Currently selected option value.
 * @param root0.onChange - Callback invoked when the selection changes.
 * @param root0.options - List of selectable option values.
 * @param root0.description - Optional help text below the select.
 * @param root0.defaultValue - Optional default value shown as hint text.
 * @param root0.required - Whether to show a required indicator.
 * @param root0.placeholder - Optional empty option label.
 * @returns The rendered select field.
 */
export function FormSelect({
    label,
    value,
    onChange,
    options,
    description,
    defaultValue,
    required,
    placeholder,
}: FormSelectProps) {
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
        select: {
            width: '100%',
            padding: '6px 10px',
            background:
                'var(--ui-input-bg, var(--vscode-dropdown-background, var(--vscode-input-background)))',
            color: 'var(--ui-input-fg, var(--vscode-dropdown-foreground, var(--vscode-input-foreground)))',
            border: '1px solid var(--ui-input-border, var(--vscode-dropdown-border, var(--vscode-input-border, transparent)))',
            borderRadius: 4,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box' as const,
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
            <select
                style={styles.select}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </select>
            {description && <div style={styles.help}>{description}</div>}
            {defaultValue !== undefined && (
                <div style={styles.default}>Default: {defaultValue}</div>
            )}
        </div>
    );
}
