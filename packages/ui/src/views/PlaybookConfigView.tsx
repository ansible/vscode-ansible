import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { PlaybookConfigBridge } from '../bridge/playbook';
import type { PlaybookConfig } from '@ansible/common';
import { FormTextField } from '../components/form/FormTextField';
import { FormSelect } from '../components/form/FormSelect';
import { FormCheckbox } from '../components/form/FormCheckbox';
import { FormListBuilder } from '../components/form/FormListBuilder';
import { FormSection } from '../components/form/FormSection';

/**
 * React view for editing ansible-playbook run configuration.
 * Replaces the monolithic HTML/JS in the old PlaybookConfigPanel.
 *
 * @returns The rendered playbook config form.
 */
export function PlaybookConfigView() {
    const bridge = useBridge() as PlaybookConfigBridge;
    const [config, setConfig] = useState<PlaybookConfig | null>(null);
    const [zoom, setZoom] = useState(100);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    useEffect(() => {
        void bridge.loadConfig().then((c) => {
            setConfig(c);
        });
    }, [bridge]);

    const updateField = useCallback(
        <K extends keyof PlaybookConfig>(key: K, value: PlaybookConfig[K]) => {
            setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
            setStatus('idle');
        },
        [],
    );

    const handleSave = useCallback(async () => {
        if (!config) return;
        setSaving(true);
        try {
            await bridge.saveConfig(config);
            setStatus('saved');
        } catch {
            setStatus('error');
        } finally {
            setSaving(false);
        }
    }, [bridge, config]);

    const handleRun = useCallback(async () => {
        if (!config) return;
        await bridge.saveConfig(config);
        await bridge.runPlaybook(config);
    }, [bridge, config]);

    const handleReset = useCallback(async () => {
        const defaults = await bridge.resetToDefaults();
        setConfig(defaults);
        setStatus('idle');
    }, [bridge]);

    const preview = useMemo(() => {
        if (!config) return '';
        return bridge.buildPreview(config);
    }, [bridge, config]);

    const handleZoomIn = useCallback(() => {
        setZoom((z) => Math.min(z + 10, 200));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom((z) => Math.max(z - 10, 50));
    }, []);

    if (!config) {
        return (
            <div style={{ padding: 20, color: 'var(--ui-text-secondary)' }}>
                Loading configuration&hellip;
            </div>
        );
    }

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
            maxWidth: 640,
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
        subtitle: {
            fontFamily: 'monospace',
            color: 'var(--ui-text-secondary)',
            fontSize: 12,
        },
        previewSection: {
            marginBottom: 24,
        },
        previewLabel: {
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ui-text-secondary)',
            marginBottom: 8,
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
        },
        previewBox: {
            padding: '10px 14px',
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
            gap: 10,
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid var(--ui-border)',
        },
        primaryBtn: {
            padding: '8px 20px',
            background: 'var(--ui-accent, var(--vscode-button-background, #007acc))',
            color: 'var(--ui-accent-fg, var(--vscode-button-foreground, #fff))',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
        },
        secondaryBtn: {
            padding: '8px 16px',
            background: 'transparent',
            color: 'var(--ui-text-primary)',
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
        },
        statusText: {
            fontSize: 12,
            color: status === 'saved' ? '#28a745' : status === 'error' ? '#dc3545' : 'transparent',
            alignSelf: 'center',
            marginLeft: 'auto',
        },
    };

    return (
        <>
            <div style={styles.toolbar}>
                <button
                    type="button"
                    style={styles.toolbarBtn}
                    title="Zoom out"
                    onClick={handleZoomOut}
                >
                    &minus;
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
                        <h1 style={styles.title}>
                            {bridge.isGlobal ? 'Playbook Defaults' : bridge.playbookName}
                        </h1>
                        <div style={styles.subtitle}>
                            {bridge.isGlobal
                                ? 'Global ansible-playbook settings'
                                : bridge.playbookPath}
                        </div>
                    </div>

                    <div style={styles.previewSection}>
                        <div style={styles.previewLabel}>Command Preview</div>
                        <div style={styles.previewBox}>{preview}</div>
                    </div>

                    <FormSection title="Executor">
                        <FormSelect
                            label="Run With"
                            value={config.executor ?? 'ansible-playbook'}
                            onChange={(v) => {
                                updateField('executor', v);
                            }}
                            options={['ansible-playbook', 'ansible-navigator']}
                            description="ansible-navigator provides execution environment integration and artifact collection"
                            defaultValue="ansible-playbook"
                        />
                    </FormSection>

                    <FormSection title="Inventory & Targeting">
                        <FormListBuilder
                            label="Inventory"
                            items={config.inventory ?? []}
                            onChange={(items) => {
                                updateField('inventory', items);
                            }}
                            description="Inventory host path or comma-separated host list (-i)"
                            placeholder="hosts.ini or host1,host2"
                        />
                        <FormTextField
                            label="Limit"
                            value={config.limit ?? ''}
                            onChange={(v) => {
                                updateField('limit', v);
                            }}
                            description="Further limit selected hosts to a pattern (-l)"
                            placeholder="webservers:&dbservers"
                        />
                        <FormListBuilder
                            label="Tags"
                            items={config.tags ?? []}
                            onChange={(items) => {
                                updateField('tags', items);
                            }}
                            description="Only run plays and tasks tagged with these values (-t)"
                            placeholder="deploy, configure"
                        />
                        <FormListBuilder
                            label="Skip Tags"
                            items={config.skipTags ?? []}
                            onChange={(items) => {
                                updateField('skipTags', items);
                            }}
                            description="Skip plays and tasks with these tags (--skip-tags)"
                            placeholder="slow, debug"
                        />
                        <FormTextField
                            label="Extra Variables"
                            value={config.extraVars ?? ''}
                            onChange={(v) => {
                                updateField('extraVars', v);
                            }}
                            description="Set additional variables as key=value or YAML/JSON (-e)"
                            placeholder="env=production version=1.0"
                        />
                        <FormTextField
                            label="Forks"
                            value={config.forks !== undefined ? String(config.forks) : ''}
                            onChange={(v) => {
                                updateField('forks', v ? Number(v) : undefined);
                            }}
                            description="Number of parallel processes to use (-f)"
                            defaultValue="5"
                        />
                    </FormSection>

                    <FormSection title="Connection">
                        <FormSelect
                            label="Connection Type"
                            value={config.connection ?? 'ssh'}
                            onChange={(v) => {
                                updateField('connection', v);
                            }}
                            options={[
                                'ssh',
                                'local',
                                'paramiko',
                                'winrm',
                                'httpapi',
                                'network_cli',
                                'netconf',
                            ]}
                            description="Connection type to use (-c)"
                            defaultValue="ssh"
                        />
                        <FormTextField
                            label="Remote User"
                            value={config.user ?? ''}
                            onChange={(v) => {
                                updateField('user', v);
                            }}
                            description="Connect as this user (-u)"
                        />
                        <FormTextField
                            label="SSH Timeout"
                            value={config.timeout !== undefined ? String(config.timeout) : ''}
                            onChange={(v) => {
                                updateField('timeout', v ? Number(v) : undefined);
                            }}
                            description="Override the connection timeout in seconds (-T)"
                        />
                        <FormTextField
                            label="Private Key File"
                            value={config.privateKey ?? ''}
                            onChange={(v) => {
                                updateField('privateKey', v);
                            }}
                            description="Use this file to authenticate the connection (--private-key)"
                            isPath
                        />
                        <FormCheckbox
                            label="Ask for Connection Password"
                            checked={config.askPass ?? false}
                            onChange={(v) => {
                                updateField('askPass', v);
                            }}
                            description="Prompt for connection password (--ask-pass)"
                        />
                    </FormSection>

                    <FormSection title="Privilege Escalation">
                        <FormCheckbox
                            label="Become"
                            checked={config.become ?? false}
                            onChange={(v) => {
                                updateField('become', v);
                            }}
                            description="Run operations with become (--become)"
                        />
                        <FormSelect
                            label="Become Method"
                            value={config.becomeMethod ?? 'sudo'}
                            onChange={(v) => {
                                updateField('becomeMethod', v);
                            }}
                            options={[
                                'sudo',
                                'su',
                                'pbrun',
                                'pfexec',
                                'doas',
                                'dzdo',
                                'ksu',
                                'runas',
                            ]}
                            description="Privilege escalation method to use (--become-method)"
                            defaultValue="sudo"
                        />
                        <FormTextField
                            label="Become User"
                            value={config.becomeUser ?? ''}
                            onChange={(v) => {
                                updateField('becomeUser', v);
                            }}
                            description="Run operations as this user (--become-user)"
                            defaultValue="root"
                        />
                        <FormCheckbox
                            label="Ask for Become Password"
                            checked={config.askBecomePass ?? false}
                            onChange={(v) => {
                                updateField('askBecomePass', v);
                            }}
                            description="Ask for privilege escalation password (--ask-become-pass)"
                        />
                    </FormSection>

                    <FormSection title="Vault">
                        <FormTextField
                            label="Vault Password File"
                            value={config.vaultPasswordFile ?? ''}
                            onChange={(v) => {
                                updateField('vaultPasswordFile', v);
                            }}
                            description="Vault password file (--vault-password-file)"
                            isPath
                        />
                        <FormCheckbox
                            label="Ask for Vault Password"
                            checked={config.askVaultPass ?? false}
                            onChange={(v) => {
                                updateField('askVaultPass', v);
                            }}
                            description="Ask for vault decrypt password (--ask-vault-pass)"
                        />
                    </FormSection>

                    <FormSection title="Execution Options">
                        <FormCheckbox
                            label="Check Mode (Dry Run)"
                            checked={config.check ?? false}
                            onChange={(v) => {
                                updateField('check', v);
                            }}
                            description="Don't make any changes; predict some of the changes that may occur (--check)"
                        />
                        <FormCheckbox
                            label="Diff Mode"
                            checked={config.diff ?? false}
                            onChange={(v) => {
                                updateField('diff', v);
                            }}
                            description="Show differences in files and templates (--diff)"
                        />
                        <FormCheckbox
                            label="Step Mode"
                            checked={config.step ?? false}
                            onChange={(v) => {
                                updateField('step', v);
                            }}
                            description="Confirm each task before running (--step)"
                        />
                        <FormSelect
                            label="Verbosity"
                            value={String(config.verbose ?? 0)}
                            onChange={(v) => {
                                updateField('verbose', Number(v));
                            }}
                            options={['0', '1', '2', '3', '4', '5', '6']}
                            description="Verbosity level (0 = normal, 1-6 = increasing -v flags)"
                            defaultValue="0"
                        />
                        <FormTextField
                            label="Start at Task"
                            value={config.startAtTask ?? ''}
                            onChange={(v) => {
                                updateField('startAtTask', v);
                            }}
                            description="Start the playbook at the task matching this name (--start-at-task)"
                        />
                    </FormSection>

                    <div style={styles.buttonRow}>
                        <button
                            type="button"
                            style={styles.primaryBtn}
                            onClick={() => void handleSave()}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        {!bridge.isGlobal && (
                            <button
                                type="button"
                                style={styles.primaryBtn}
                                onClick={() => void handleRun()}
                            >
                                Run
                            </button>
                        )}
                        <button
                            type="button"
                            style={styles.secondaryBtn}
                            onClick={() => void handleReset()}
                        >
                            Reset to Defaults
                        </button>
                        <span style={styles.statusText}>
                            {status === 'saved'
                                ? 'Saved'
                                : status === 'error'
                                  ? 'Error saving'
                                  : ''}
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}
