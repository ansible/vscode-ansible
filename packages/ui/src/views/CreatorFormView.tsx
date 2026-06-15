import { useState, useCallback, useMemo, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { CreatorBridge, SchemaNode } from '../bridge/creator';
import { SchemaForm } from '../components/SchemaForm';

interface CreatorFormViewProps {
    commandPath: string[];
    schema: SchemaNode;
    buildPreview: (values: Record<string, unknown>) => string;
}

type ExecutionState =
    | { status: 'idle' }
    | { status: 'running'; command: string }
    | { status: 'done'; command: string; exitCode: number; output: string };

/**
 * Converts a schema name to a display title.
 *
 * @param name - Schema node name (snake_case or kebab-case).
 * @returns Title-cased display string.
 */
function toTitle(name: string): string {
    return name
        .split(/[_-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Orchestrator view that connects SchemaForm to the creator bridge.
 * @param root0 - Component props.
 * @param root0.commandPath - Command path segments after `ansible-creator`.
 * @param root0.schema - Command schema node with parameter definitions.
 * @param root0.buildPreview - Builds the command preview string from form values.
 * @returns The rendered creator form view.
 */
export function CreatorFormView({ commandPath, schema, buildPreview }: CreatorFormViewProps) {
    const bridge = useBridge() as CreatorBridge;
    const [zoom, setZoom] = useState(100);
    const [execution, setExecution] = useState<ExecutionState>({ status: 'idle' });

    useEffect(() => {
        const unsubStart = bridge.onExecutionStarted((event) => {
            setExecution({ status: 'running', command: event.command });
        });
        const unsubFinish = bridge.onExecutionFinished((event) => {
            setExecution((prev) => ({
                status: 'done',
                command: prev.status !== 'idle' ? prev.command : '',
                exitCode: event.exitCode,
                output: event.output,
            }));
        });
        return () => {
            unsubStart();
            unsubFinish();
        };
    }, [bridge]);

    const handleExecute = useCallback(
        (values: Record<string, unknown>) => {
            void bridge.execute(commandPath, values);
        },
        [bridge, commandPath],
    );

    const handleCancel = useCallback(() => {
        bridge.cancel();
    }, [bridge]);

    const handleReset = useCallback(() => {
        setExecution({ status: 'idle' });
    }, []);

    const handleZoomIn = useCallback(() => {
        setZoom((z) => Math.min(z + 10, 200));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom((z) => Math.max(z - 10, 50));
    }, []);

    const title = useMemo(() => toTitle(schema.name), [schema.name]);
    const pathDisplay = useMemo(() => `ansible-creator ${commandPath.join(' ')}`, [commandPath]);

    const styles: Record<string, CSSProperties> = {
        toolbar: {
            position: 'fixed',
            top: 12,
            right: 20,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--ui-bg-primary)',
            border: '1px solid var(--ui-border)',
            borderRadius: 6,
            padding: 4,
        },
        toolbarBtn: {
            background: 'transparent',
            border: 'none',
            color: 'var(--ui-text-primary)',
            opacity: 0.7,
            padding: '4px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            minWidth: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        },
        zoomLabel: {
            fontSize: 11,
            color: 'var(--ui-text-primary)',
            opacity: 0.7,
            minWidth: 40,
            textAlign: 'center',
        },
        mainContent: {
            padding: 20,
            paddingTop: 60,
            zoom: zoom / 100,
        },
        container: {
            maxWidth: 600,
            margin: '0 auto',
        },
        header: {
            marginBottom: 24,
            paddingBottom: 16,
            borderBottom: '1px solid var(--ui-border)',
        },
        title: {
            fontSize: 18,
            margin: '0 0 8px 0',
            fontWeight: 600,
            color: 'var(--ui-text-primary)',
        },
        commandPath: {
            fontFamily: 'monospace',
            color: 'var(--ui-text-secondary)',
            fontSize: 12,
        },
        description: {
            color: 'var(--ui-text-secondary)',
            marginBottom: 24,
            fontSize: 13,
        },
        outputSection: {
            marginTop: 24,
        },
        outputLabel: {
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ui-text-secondary)',
            marginBottom: 8,
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
        },
        outputBox: {
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
            maxHeight: 400,
            overflowY: 'auto',
        },
        successBadge: {
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(40, 167, 69, 0.15)',
            color: '#28a745',
            marginBottom: 12,
        },
        errorBadge: {
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(220, 53, 69, 0.15)',
            color: '#dc3545',
            marginBottom: 12,
        },
        runningIndicator: {
            padding: '12px 16px',
            background: 'var(--ui-bg-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            fontSize: 13,
            color: 'var(--ui-text-secondary)',
        },
        resetBtn: {
            marginTop: 16,
            padding: '8px 16px',
            background: 'transparent',
            color: 'var(--ui-text-primary)',
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
        },
    };

    if (execution.status === 'running') {
        return (
            <>
                <div style={styles.toolbar}>
                    <button
                        type="button"
                        style={styles.toolbarBtn}
                        title="Zoom out"
                        onClick={handleZoomOut}
                    >
                        −
                    </button>
                    <span style={styles.zoomLabel}>{zoom}%</span>
                    <button
                        type="button"
                        style={styles.toolbarBtn}
                        title="Zoom in"
                        onClick={handleZoomIn}
                    >
                        +
                    </button>
                </div>
                <div style={styles.mainContent}>
                    <div style={styles.container}>
                        <div style={styles.header}>
                            <h1 style={styles.title}>{title}</h1>
                            <div style={styles.commandPath}>{pathDisplay}</div>
                        </div>
                        <div style={styles.outputSection}>
                            <div style={styles.outputLabel}>Running</div>
                            <div style={styles.runningIndicator}>Executing command&hellip;</div>
                            <div style={{ ...styles.outputBox, marginTop: 12 }}>
                                $ {execution.command}
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (execution.status === 'done') {
        const isSuccess = execution.exitCode === 0;
        return (
            <>
                <div style={styles.toolbar}>
                    <button
                        type="button"
                        style={styles.toolbarBtn}
                        title="Zoom out"
                        onClick={handleZoomOut}
                    >
                        −
                    </button>
                    <span style={styles.zoomLabel}>{zoom}%</span>
                    <button
                        type="button"
                        style={styles.toolbarBtn}
                        title="Zoom in"
                        onClick={handleZoomIn}
                    >
                        +
                    </button>
                </div>
                <div style={styles.mainContent}>
                    <div style={styles.container}>
                        <div style={styles.header}>
                            <h1 style={styles.title}>{title}</h1>
                            <div style={styles.commandPath}>{pathDisplay}</div>
                        </div>
                        <div style={styles.outputSection}>
                            <div style={isSuccess ? styles.successBadge : styles.errorBadge}>
                                {isSuccess
                                    ? 'Success'
                                    : `Failed (exit code ${String(execution.exitCode)})`}
                            </div>
                            <div style={styles.outputBox}>
                                <div
                                    style={{
                                        color: 'var(--ui-text-secondary)',
                                        marginBottom: 8,
                                    }}
                                >
                                    $ {execution.command}
                                </div>
                                {execution.output || '(no output)'}
                            </div>
                            <button type="button" style={styles.resetBtn} onClick={handleReset}>
                                Run Again
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div style={styles.toolbar}>
                <button
                    type="button"
                    style={styles.toolbarBtn}
                    title="Zoom out"
                    onClick={handleZoomOut}
                >
                    −
                </button>
                <span style={styles.zoomLabel}>{zoom}%</span>
                <button
                    type="button"
                    style={styles.toolbarBtn}
                    title="Zoom in"
                    onClick={handleZoomIn}
                >
                    +
                </button>
            </div>

            <div style={styles.mainContent}>
                <div style={styles.container}>
                    <div style={styles.header}>
                        <h1 style={styles.title}>{title}</h1>
                        <div style={styles.commandPath}>{pathDisplay}</div>
                    </div>

                    {schema.description && (
                        <div style={styles.description}>{schema.description}</div>
                    )}

                    <SchemaForm
                        schema={schema}
                        workspacePath={bridge.workspacePath}
                        onExecute={handleExecute}
                        onCancel={handleCancel}
                        buildPreview={buildPreview}
                    />
                </div>
            </div>
        </>
    );
}
