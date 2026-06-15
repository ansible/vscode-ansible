import { useState, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SchemaNode, ParameterSchema } from '../bridge/creator';
import { FormTextField } from './form/FormTextField';
import { FormSelect } from './form/FormSelect';
import { FormCheckbox } from './form/FormCheckbox';
import { FormSection } from './form/FormSection';
import { FormListBuilder } from './form/FormListBuilder';

/** Default schema parameter keys hidden from the creator form UI. */
const DEFAULT_FILTERED_KEYS = ['no_ansi', 'log_file', 'log_level', 'log_append', 'json', 'verbose'];

interface SchemaFormProps {
    schema: SchemaNode;
    workspacePath?: string;
    filteredKeys?: string[];
    onExecute: (values: Record<string, unknown>) => void;
    onCancel?: () => void;
    buildPreview: (values: Record<string, unknown>) => string;
}

/**
 * Safely converts an unknown value to a display string.
 *
 * @param value - Value to stringify without risking `[object Object]`.
 * @returns String representation suitable for form display.
 */
function safeStr(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

/**
 * Converts a parameter key to a human-readable label.
 *
 * @param name - Schema parameter name (snake_case or kebab-case).
 * @returns Title-cased label for form display.
 */
function toLabel(name: string): string {
    return name
        .split(/[_-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Schema-driven form that renders ansible-creator command parameters.
 * @param root0 - Component props.
 * @param root0.schema - Command schema node with parameter definitions.
 * @param root0.workspacePath - Optional workspace root for pre-filling path fields.
 * @param root0.filteredKeys - Parameter keys to hide from the form.
 * @param root0.onExecute - Callback invoked with form values when Run is clicked.
 * @param root0.onCancel - Optional callback invoked when Cancel is clicked.
 * @param root0.buildPreview - Builds the command preview string from current form values.
 * @returns The rendered schema form.
 */
export function SchemaForm({
    schema,
    workspacePath,
    filteredKeys,
    onExecute,
    onCancel,
    buildPreview,
}: SchemaFormProps) {
    const properties = schema.parameters?.properties ?? {};
    const requiredKeys = useMemo(() => schema.parameters?.required ?? [], [schema]);
    const filtered = useMemo(() => new Set(filteredKeys ?? DEFAULT_FILTERED_KEYS), [filteredKeys]);

    const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
        const initial: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(properties)) {
            if (filtered.has(key)) continue;
            if (prop.default !== undefined && prop.default !== null) {
                initial[key] = prop.default;
            }
            if ((key === 'path' || key === 'init_path') && workspacePath) {
                initial[key] = workspacePath;
            }
        }
        return initial;
    });

    const updateValue = useCallback((key: string, value: unknown) => {
        setFormValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const sortedKeys = useMemo(() => {
        return Object.keys(properties)
            .filter((k) => !filtered.has(k))
            .sort((a, b) => {
                const aReq = requiredKeys.includes(a);
                const bReq = requiredKeys.includes(b);
                if (aReq && !bReq) return -1;
                if (!aReq && bReq) return 1;
                return a.localeCompare(b);
            });
    }, [properties, requiredKeys, filtered]);

    const requiredFields = useMemo(
        () => sortedKeys.filter((k) => requiredKeys.includes(k)),
        [sortedKeys, requiredKeys],
    );
    const optionalFields = useMemo(
        () => sortedKeys.filter((k) => !requiredKeys.includes(k)),
        [sortedKeys, requiredKeys],
    );

    const isValid = useMemo(() => {
        for (const key of requiredKeys) {
            if (filtered.has(key)) continue;
            const val = formValues[key];
            if (val === undefined || val === null || val === '') return false;
        }
        return true;
    }, [requiredKeys, formValues, filtered]);

    const preview = useMemo(() => buildPreview(formValues), [buildPreview, formValues]);

    const handleExecute = useCallback(() => {
        if (isValid) {
            onExecute(formValues);
        }
    }, [isValid, formValues, onExecute]);

    const renderField = useCallback(
        (key: string) => {
            const prop: ParameterSchema = properties[key];
            const isRequired = requiredKeys.includes(key);
            const label = toLabel(key);
            const isPath = key === 'path' || key === 'init_path';

            if (prop.type === 'boolean') {
                return (
                    <FormCheckbox
                        key={key}
                        label={label}
                        checked={formValues[key] === true}
                        onChange={(checked) => {
                            updateValue(key, checked);
                        }}
                        description={prop.description}
                    />
                );
            }

            if (prop.type === 'array') {
                const currentItems = Array.isArray(formValues[key])
                    ? (formValues[key] as string[])
                    : [];
                return (
                    <FormListBuilder
                        key={key}
                        label={label}
                        items={currentItems}
                        onChange={(items) => {
                            updateValue(key, items);
                        }}
                        description={prop.description}
                        defaultValue={
                            prop.default !== undefined ? safeStr(prop.default) : undefined
                        }
                        required={isRequired}
                    />
                );
            }

            if (prop.enum && prop.enum.length > 0) {
                return (
                    <FormSelect
                        key={key}
                        label={label}
                        value={safeStr(formValues[key])}
                        onChange={(v) => {
                            updateValue(key, v);
                        }}
                        options={prop.enum}
                        description={prop.description}
                        defaultValue={
                            prop.default !== undefined ? safeStr(prop.default) : undefined
                        }
                        required={isRequired}
                        placeholder={isRequired ? undefined : '-- Select --'}
                    />
                );
            }

            return (
                <FormTextField
                    key={key}
                    label={label}
                    value={safeStr(formValues[key])}
                    onChange={(v) => {
                        updateValue(key, v);
                    }}
                    placeholder={prop.description}
                    description={prop.description}
                    defaultValue={
                        prop.default !== undefined && prop.type !== 'boolean'
                            ? safeStr(prop.default)
                            : undefined
                    }
                    required={isRequired}
                    isPath={isPath}
                />
            );
        },
        [properties, requiredKeys, formValues, updateValue],
    );

    const styles: Record<string, CSSProperties> = {
        previewSection: { marginTop: 24 },
        previewLabel: {
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ui-text-secondary)',
            marginBottom: 8,
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
        },
        preview: {
            padding: '12px 16px',
            background: 'var(--ui-bg-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            fontFamily: "'SF Mono', Consolas, monospace",
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.5,
            color: 'var(--ui-text-primary)',
        },
        buttonRow: {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid var(--ui-border)',
        },
        cancelBtn: {
            padding: '8px 16px',
            background: 'transparent',
            color: 'var(--ui-text-primary)',
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
        },
        executeBtn: {
            padding: '8px 16px',
            background: 'var(--ui-accent, var(--vscode-button-background, #007acc))',
            color: 'var(--ui-accent-fg, var(--vscode-button-foreground, #fff))',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: isValid ? 'pointer' : 'default',
            opacity: isValid ? 1 : 0.5,
        },
    };

    return (
        <>
            {requiredFields.length > 0 && (
                <FormSection title="Required Parameters">
                    {requiredFields.map(renderField)}
                </FormSection>
            )}

            {optionalFields.length > 0 && (
                <FormSection title="Optional Parameters">
                    {optionalFields.map(renderField)}
                </FormSection>
            )}

            <div style={styles.previewSection}>
                <div style={styles.previewLabel}>Command Preview</div>
                <div style={styles.preview}>{preview}</div>
            </div>

            <div style={styles.buttonRow}>
                {onCancel && (
                    <button type="button" style={styles.cancelBtn} onClick={onCancel}>
                        Cancel
                    </button>
                )}
                <button
                    type="button"
                    style={styles.executeBtn}
                    disabled={!isValid}
                    onClick={handleExecute}
                >
                    Run
                </button>
            </div>
        </>
    );
}
