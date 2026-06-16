import type { CSSProperties } from 'react';

interface FormTextFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    description?: string;
    defaultValue?: string;
    required?: boolean;
    isPath?: boolean;
}

/**
 * Text input field with label, description, required indicator, and default display.
 * @param root0 - Component props.
 * @param root0.label - Field label shown above the input.
 * @param root0.value - Current input value.
 * @param root0.onChange - Callback invoked when the input value changes.
 * @param root0.placeholder - Optional placeholder text.
 * @param root0.description - Optional help text below the input.
 * @param root0.defaultValue - Optional default value shown as hint text.
 * @param root0.required - Whether to show a required indicator.
 * @param root0.isPath - Whether to use monospace font for path fields.
 * @returns The rendered text field.
 */
export function FormTextField({
    label,
    value,
    onChange,
    placeholder,
    description,
    defaultValue,
    required,
    isPath,
}: FormTextFieldProps) {
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
        input: {
            width: '100%',
            padding: '6px 10px',
            background: 'var(--ui-input-bg, var(--vscode-input-background))',
            color: 'var(--ui-input-fg, var(--vscode-input-foreground))',
            border: '1px solid var(--ui-input-border, var(--vscode-input-border, var(--ui-border, #444)))',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: isPath ? 'var(--vscode-editor-font-family, monospace)' : 'inherit',
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
            <input
                type="text"
                style={styles.input}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
                placeholder={placeholder}
                onFocus={(e) => {
                    e.target.style.borderColor =
                        'var(--ui-input-focus-border, var(--vscode-focusBorder, #007acc))';
                }}
                onBlur={(e) => {
                    e.target.style.borderColor =
                        'var(--ui-input-border, var(--vscode-input-border, var(--ui-border, #444)))';
                }}
            />
            {description && <div style={styles.help}>{description}</div>}
            {defaultValue !== undefined && (
                <div style={styles.default}>Default: {defaultValue}</div>
            )}
        </div>
    );
}
