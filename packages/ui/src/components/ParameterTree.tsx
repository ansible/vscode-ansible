import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { PluginOption } from '../bridge/plugin-doc';
import { formatAnsibleMarkup, toArray } from '../utils/ansible-markup';
import { formatYamlValue } from '../utils/sample-task';

interface ParameterTreeProps {
    options: Record<string, PluginOption>;
}

interface ParamItemProps {
    name: string;
    opt: PluginOption;
    depth?: number;
}

const styles: Record<string, CSSProperties> = {
    tree: {
        fontSize: '12px',
    },
    item: {
        borderBottom: '1px solid var(--ui-border)',
        padding: '8px 0',
    },
    header: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        cursor: 'pointer',
        userSelect: 'none',
    },
    headerStatic: {
        cursor: 'default',
    },
    toggle: {
        width: 14,
        height: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        color: 'var(--ui-text-muted)',
        flexShrink: 0,
        marginTop: 2,
    },
    name: {
        fontFamily: 'var(--ui-font-mono)',
        fontWeight: 600,
        color: 'var(--ui-text-primary)',
    },
    type: {
        fontSize: '11px',
        color: 'var(--ui-text-secondary)',
        fontFamily: 'var(--ui-font-mono)',
    },
    required: {
        fontSize: '10px',
        fontWeight: 600,
        color: 'var(--ui-text-primary)',
        background: 'var(--ui-error)',
        padding: '1px 6px',
        borderRadius: 10,
        marginLeft: 4,
    },
    choices: {
        marginTop: 4,
        marginLeft: 22,
    },
    choice: {
        display: 'inline-block',
        background: 'var(--ui-bg-surface)',
        border: '1px solid var(--ui-border)',
        padding: '1px 6px',
        borderRadius: 3,
        fontFamily: 'var(--ui-font-mono)',
        fontSize: '11px',
        marginRight: 4,
        marginBottom: 2,
        color: 'var(--ui-text-primary)',
    },
    choiceDefault: {
        borderColor: 'var(--ui-accent)',
    },
    defaultValue: {
        fontSize: '11px',
        color: 'var(--ui-text-secondary)',
        marginTop: 4,
        marginLeft: 22,
    },
    desc: {
        color: 'var(--ui-text-primary)',
        marginTop: 4,
        marginLeft: 22,
        fontSize: '12px',
    },
    descParagraph: {
        margin: '0 0 4px 0',
    },
    suboptions: {
        marginLeft: 22,
        marginTop: 8,
        paddingLeft: 12,
        borderLeft: '1px solid var(--ui-border)',
    },
    empty: {
        color: 'var(--ui-text-muted)',
        fontStyle: 'italic',
        fontSize: '12px',
    },
};

/**
 * Render a single parameter row with collapsible suboptions.
 * @param root0 - Component props.
 * @param root0.name - Parameter name.
 * @param root0.opt - Parameter schema metadata.
 * @param root0.depth - Nesting depth for suboption indentation.
 * @returns The rendered parameter item.
 */
function ParamItem({ name, opt, depth = 0 }: ParamItemProps) {
    const [expanded, setExpanded] = useState(false);
    const hasSuboptions = Boolean(opt.suboptions && Object.keys(opt.suboptions).length > 0);

    const typeStr = opt.type ?? 'str';
    const elementsStr = opt.elements ? `/${opt.elements}` : '';
    const indentOffset = depth > 0 ? 0 : 22;

    const toggleExpanded = () => {
        if (hasSuboptions) {
            setExpanded((prev) => !prev);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (hasSuboptions && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            toggleExpanded();
        }
    };

    return (
        <div style={styles.item}>
            <div
                style={{
                    ...styles.header,
                    ...(!hasSuboptions ? styles.headerStatic : {}),
                }}
                role={hasSuboptions ? 'button' : undefined}
                tabIndex={hasSuboptions ? 0 : undefined}
                onClick={toggleExpanded}
                onKeyDown={handleKeyDown}
            >
                <span style={styles.toggle}>{hasSuboptions ? (expanded ? '▼' : '▶') : ''}</span>
                <span style={styles.name}>{name}</span>
                <span style={styles.type}>
                    ({typeStr}
                    {elementsStr})
                </span>
                {opt.required && <span style={styles.required}>required</span>}
            </div>

            {opt.choices && opt.choices.length > 0 && (
                <div style={{ ...styles.choices, marginLeft: indentOffset }}>
                    {opt.choices.map((choice) => {
                        const isDefault = opt.default === choice;
                        return (
                            <span
                                key={choice}
                                style={{
                                    ...styles.choice,
                                    ...(isDefault ? styles.choiceDefault : {}),
                                }}
                            >
                                {choice}
                            </span>
                        );
                    })}
                </div>
            )}

            {!opt.choices?.length && opt.default !== undefined && opt.default !== null && (
                <div style={{ ...styles.defaultValue, marginLeft: indentOffset }}>
                    default: <code>{formatYamlValue(opt.default)}</code>
                </div>
            )}

            <div style={{ ...styles.desc, marginLeft: indentOffset }}>
                {toArray(opt.description).map((paragraph, i) => (
                    <p
                        key={i}
                        style={styles.descParagraph}
                        dangerouslySetInnerHTML={{
                            __html: formatAnsibleMarkup(paragraph),
                        }}
                    />
                ))}
            </div>

            {hasSuboptions && expanded && (
                <div style={styles.suboptions}>
                    <ParameterTree options={opt.suboptions ?? {}} />
                </div>
            )}
        </div>
    );
}

/**
 * Recursive parameter documentation tree with collapsible suboptions.
 * @param root0 - Component props.
 * @param root0.options - Parameter schema map for the plugin.
 * @returns The rendered parameter tree.
 */
export function ParameterTree({ options }: ParameterTreeProps) {
    const entries = Object.entries(options).sort((a, b) => a[0].localeCompare(b[0]));

    if (entries.length === 0) {
        return <div style={styles.empty}>No parameters</div>;
    }

    return (
        <div style={styles.tree}>
            {entries.map(([name, opt]) => (
                <ParamItem key={name} name={name} opt={opt} />
            ))}
        </div>
    );
}
