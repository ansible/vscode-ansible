import type { CSSProperties } from 'react';

interface FormCheckboxProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    description?: string;
}

/**
 * Checkbox field with inline label and optional description.
 * @param root0 - Component props.
 * @param root0.label - Checkbox label text.
 * @param root0.checked - Whether the checkbox is checked.
 * @param root0.onChange - Callback invoked when the checked state changes.
 * @param root0.description - Optional help text below the label.
 * @returns The rendered checkbox field.
 */
export function FormCheckbox({ label, checked, onChange, description }: FormCheckboxProps) {
    const styles: Record<string, CSSProperties> = {
        group: { marginBottom: 20 },
        wrapper: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
        },
        checkbox: {
            marginTop: 2,
            accentColor: 'var(--ui-accent, var(--vscode-checkbox-background, #007acc))',
        },
        content: { flex: 1 },
        label: {
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--ui-text-primary)',
        },
        description: {
            fontSize: 11,
            color: 'var(--ui-text-secondary)',
            marginTop: 4,
            lineHeight: 1.4,
        },
    };

    return (
        <div style={styles.group}>
            <div style={styles.wrapper}>
                <input
                    type="checkbox"
                    style={styles.checkbox}
                    checked={checked}
                    onChange={(e) => {
                        onChange(e.target.checked);
                    }}
                />
                <div style={styles.content}>
                    <div style={styles.label}>{label}</div>
                    {description && <div style={styles.description}>{description}</div>}
                </div>
            </div>
        </div>
    );
}
