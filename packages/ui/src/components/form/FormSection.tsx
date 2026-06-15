import type { CSSProperties, ReactNode } from 'react';

interface FormSectionProps {
    title: string;
    children: ReactNode;
}

/**
 * Visual section grouping form fields with a titled header.
 * @param root0 - Component props.
 * @param root0.title - Section title displayed above the fields.
 * @param root0.children - Form fields rendered inside the section.
 * @returns The rendered form section.
 */
export function FormSection({ title, children }: FormSectionProps) {
    const styles: Record<string, CSSProperties> = {
        section: {
            marginBottom: 24,
            background: 'var(--ui-bg-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 6,
            padding: 16,
        },
        title: {
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
            paddingBottom: 10,
            borderBottom: '1px solid var(--ui-border)',
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
            color: 'var(--ui-text-primary)',
        },
    };

    return (
        <div style={styles.section}>
            <div style={styles.title}>{title}</div>
            {children}
        </div>
    );
}
