import { useState, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useBridge } from '../bridge/context';
import type { PlaybookProgressBridge } from '../bridge/playbook';
import type { ProgressEvent } from '@ansible/core';
import { YamlBlock } from '../components/YamlBlock';
import * as yaml from 'js-yaml';

// --- State Types ---

type NodeStatus = 'running' | 'ok' | 'changed' | 'failed' | 'skipped' | 'unreachable' | 'complete';

interface HostResult {
    status: NodeStatus;
    changed?: boolean;
    duration?: number;
    result?: Record<string, unknown>;
}

interface TaskState {
    name: string;
    action?: string;
    args?: Record<string, unknown>;
    path?: string | null;
    hosts: Record<string, HostResult>;
    status: NodeStatus;
}

interface PlayState {
    name: string;
    tasks: TaskState[];
    status: NodeStatus;
}

interface Stats {
    ok: number;
    changed: number;
    failed: number;
    skipped: number;
}

type RunStatus = 'waiting' | 'running' | 'complete' | 'stopped';

type SelectedNode =
    | { type: 'playbook' }
    | { type: 'play'; playIdx: number }
    | { type: 'task'; playIdx: number; taskIdx: number }
    | { type: 'host'; playIdx: number; taskIdx: number; host: string };

/**
 * Streaming playbook progress view with hierarchical tree and detail panel.
 * Replaces the monolithic 1800-line inline HTML/JS progress panel.
 *
 * @returns The rendered playbook progress view.
 */
export function PlaybookProgressView() {
    const bridge = useBridge() as PlaybookProgressBridge;
    const [playbookName, setPlaybookName] = useState<string | null>(null);
    const [playbookStatus, setPlaybookStatus] = useState<NodeStatus>('running');
    const [plays, setPlays] = useState<PlayState[]>([]);
    const [stats, setStats] = useState<Stats>({ ok: 0, changed: 0, failed: 0, skipped: 0 });
    const [duration, setDuration] = useState(0);
    const [runStatus, setRunStatus] = useState<RunStatus>('waiting');
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['playbook']));
    const [selected, setSelected] = useState<SelectedNode | null>(null);
    const [detailTab, setDetailTab] = useState<'result' | 'invocation'>('result');

    const currentPlayIdx = useRef(-1);
    const currentTaskIdx = useRef(-1);

    const toggleExpand = useCallback((nodeId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    useEffect(() => {
        const unsubEvent = bridge.onEvent((event: ProgressEvent) => {
            handleEvent(event);
        });
        const unsubStopped = bridge.onStopped(() => {
            setRunStatus('stopped');
            setPlaybookStatus('failed');
        });
        return () => {
            unsubEvent();
            unsubStopped();
        };
    }, [bridge]);

    /**
     * Process a streaming progress event and update tree/stats state.
     * @param event - The progress event from the callback plugin socket.
     */
    function handleEvent(event: ProgressEvent) {
        const { type, data } = event;
        const str = (key: string): string => (typeof data[key] === 'string' ? data[key] : '');
        const num = (key: string): number | undefined =>
            typeof data[key] === 'number' ? data[key] : undefined;
        const bool = (key: string): boolean => data[key] === true;
        const obj = (key: string): Record<string, unknown> =>
            typeof data[key] === 'object' && data[key] != null
                ? (data[key] as Record<string, unknown>)
                : {};

        switch (type) {
            case 'playbook_start':
                setPlaybookName(str('playbook') || 'Playbook');
                setPlaybookStatus('running');
                setPlays([]);
                setStats({ ok: 0, changed: 0, failed: 0, skipped: 0 });
                setDuration(0);
                setRunStatus('running');
                currentPlayIdx.current = -1;
                currentTaskIdx.current = -1;
                setExpanded(new Set(['playbook']));
                break;

            case 'play_start': {
                setPlays((prev) => {
                    const newPlays = [
                        ...prev,
                        {
                            name: str('name') || 'Play',
                            tasks: [],
                            status: 'running' as NodeStatus,
                        },
                    ];
                    currentPlayIdx.current = newPlays.length - 1;
                    currentTaskIdx.current = -1;
                    return newPlays;
                });
                setExpanded((prev) => {
                    const next = new Set(prev);
                    next.add(`play-${String(currentPlayIdx.current + 1)}`);
                    return next;
                });
                break;
            }

            case 'task_start': {
                const pIdx = currentPlayIdx.current;
                if (pIdx < 0) break;
                setPlays((prev) => {
                    const newPlays = [...prev];
                    const play = { ...newPlays[pIdx], tasks: [...newPlays[pIdx].tasks] };
                    play.tasks.push({
                        name: str('name') || 'Task',
                        action: str('action') || undefined,
                        args: obj('args'),
                        path: str('path') || null,
                        hosts: {},
                        status: 'running',
                    });
                    newPlays[pIdx] = play;
                    currentTaskIdx.current = play.tasks.length - 1;
                    return newPlays;
                });
                setExpanded((prev) => {
                    const next = new Set(prev);
                    next.add(`task-${String(pIdx)}-${String(currentTaskIdx.current + 1)}`);
                    return next;
                });
                break;
            }

            case 'host_task_start': {
                const pIdx = currentPlayIdx.current;
                const tIdx = currentTaskIdx.current;
                if (pIdx < 0 || tIdx < 0) break;
                setPlays((prev) => {
                    const newPlays = [...prev];
                    const play = { ...newPlays[pIdx], tasks: [...newPlays[pIdx].tasks] };
                    const task = { ...play.tasks[tIdx], hosts: { ...play.tasks[tIdx].hosts } };
                    task.hosts[str('host')] = { status: 'running' };
                    play.tasks[tIdx] = task;
                    newPlays[pIdx] = play;
                    return newPlays;
                });
                break;
            }

            case 'host_ok':
            case 'host_failed':
            case 'host_skipped':
            case 'host_unreachable':
            case 'host_retry': {
                const pIdx = currentPlayIdx.current;
                const tIdx = currentTaskIdx.current;
                if (pIdx < 0 || tIdx < 0) break;

                if (type === 'host_retry') {
                    break;
                }

                const rawStatus = type.slice(5) as NodeStatus; // strip 'host_'
                const finalStatus: NodeStatus =
                    rawStatus === 'ok' && bool('changed') ? 'changed' : rawStatus;

                setPlays((prev) => {
                    const newPlays = [...prev];
                    const play = { ...newPlays[pIdx], tasks: [...newPlays[pIdx].tasks] };
                    const task = { ...play.tasks[tIdx], hosts: { ...play.tasks[tIdx].hosts } };
                    task.hosts[str('host')] = {
                        status: finalStatus,
                        changed: bool('changed') || undefined,
                        duration: num('duration'),
                        result: data.result != null ? obj('result') : undefined,
                    };
                    task.status = computeTaskStatus(task.hosts);
                    play.tasks[tIdx] = task;
                    play.status = computePlayStatus(play.tasks);
                    newPlays[pIdx] = play;
                    return newPlays;
                });

                setStats((prev) => {
                    const next = { ...prev };
                    if (finalStatus === 'ok') next.ok++;
                    else if (finalStatus === 'changed') next.changed++;
                    else if (finalStatus === 'failed') next.failed++;
                    else if (finalStatus === 'skipped') next.skipped++;
                    return next;
                });
                break;
            }

            case 'item_ok':
            case 'item_failed':
            case 'item_skipped': {
                const pIdx = currentPlayIdx.current;
                const tIdx = currentTaskIdx.current;
                if (pIdx < 0 || tIdx < 0) break;

                const itemStatus = type.slice(5) as NodeStatus; // strip 'item_'
                const itemFinalStatus: NodeStatus =
                    itemStatus === 'ok' && bool('changed') ? 'changed' : itemStatus;

                setPlays((prev) => {
                    const newPlays = [...prev];
                    const play = { ...newPlays[pIdx], tasks: [...newPlays[pIdx].tasks] };
                    const task = { ...play.tasks[tIdx], hosts: { ...play.tasks[tIdx].hosts } };
                    const host = str('host');
                    const existing = task.hosts[host];
                    task.hosts[host] = {
                        ...existing,
                        status: itemFinalStatus === 'failed' ? 'failed' : existing.status,
                        result: data.result != null ? obj('result') : undefined,
                    };
                    task.status = computeTaskStatus(task.hosts);
                    play.tasks[tIdx] = task;
                    play.status = computePlayStatus(play.tasks);
                    newPlays[pIdx] = play;
                    return newPlays;
                });
                break;
            }

            case 'include':
            case 'file_diff':
                break;

            case 'playbook_complete':
                setDuration(num('duration') ?? 0);
                setRunStatus('complete');
                setPlays((prev) => {
                    const newPlays = prev.map((play) => ({
                        ...play,
                        tasks: play.tasks.map((t) => ({
                            ...t,
                            status: t.status === 'running' ? 'ok' : t.status,
                        })),
                        status: play.status === 'running' ? 'ok' : play.status,
                    }));
                    const allStatuses = newPlays.map((p) => p.status);
                    let finalPbStatus: NodeStatus = 'complete';
                    if (allStatuses.includes('failed')) finalPbStatus = 'failed';
                    else if (allStatuses.includes('changed')) finalPbStatus = 'changed';
                    setPlaybookStatus(finalPbStatus);
                    return newPlays;
                });
                break;
        }
    }

    const getStatusIcon = (status: NodeStatus): string => {
        switch (status) {
            case 'ok':
            case 'complete':
                return '\u2713';
            case 'changed':
                return '\u27F3';
            case 'failed':
                return '\u2717';
            case 'skipped':
                return '\u2212';
            case 'unreachable':
                return '\u2298';
            case 'running':
                return '\u25D0';
            default:
                return '\u25CB';
        }
    };

    const getSelectedDetail = (): {
        title: string;
        data: Record<string, unknown> | null;
        task?: TaskState;
        host?: string;
    } => {
        if (!selected) return { title: '', data: null };

        switch (selected.type) {
            case 'playbook':
                return {
                    title: playbookName ?? 'Playbook',
                    data: { status: playbookStatus, plays: plays.length, duration },
                };
            case 'play': {
                const play = plays[selected.playIdx];
                return {
                    title: play.name,
                    data: { status: play.status, tasks: play.tasks.length },
                };
            }
            case 'task': {
                const play = plays[selected.playIdx];
                const task = play.tasks[selected.taskIdx];
                return {
                    title: task.name,
                    data: {
                        action: task.action,
                        status: task.status,
                        args: task.args,
                        path: task.path,
                    },
                    task,
                };
            }
            case 'host': {
                const play = plays[selected.playIdx];
                const task = play.tasks[selected.taskIdx];
                const hostData = task.hosts[selected.host];
                return {
                    title: `${selected.host} - ${task.name}`,
                    data: hostData.result ?? {},
                    task,
                    host: selected.host,
                };
            }
        }
    };

    const detail = getSelectedDetail();

    const styles: Record<string, CSSProperties> = {
        container: {
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
        },
        header: {
            display: 'flex',
            alignItems: 'center',
            padding: '8px 16px',
            background: 'var(--ui-bg-surface)',
            borderBottom: '1px solid var(--ui-border)',
            gap: 12,
        },
        headerTitle: { fontWeight: 600, flex: 1, fontSize: 14 },
        headerBtn: {
            background: 'transparent',
            border: '1px solid var(--ui-border)',
            color: 'var(--ui-text-primary)',
            padding: '4px 10px',
            borderRadius: 3,
            fontSize: 12,
            cursor: 'pointer',
        },
        dangerBtn: {
            background: 'transparent',
            border: '1px solid var(--ui-error, #dc3545)',
            color: 'var(--ui-error, #dc3545)',
            padding: '4px 10px',
            borderRadius: 3,
            fontSize: 12,
            cursor: 'pointer',
        },
        statusDot: {
            width: 8,
            height: 8,
            borderRadius: '50%',
            background:
                runStatus === 'running'
                    ? 'var(--ui-accent, #007acc)'
                    : runStatus === 'complete'
                      ? playbookStatus === 'failed'
                          ? 'var(--ui-error, #dc3545)'
                          : '#28a745'
                      : runStatus === 'stopped'
                        ? 'var(--ui-error, #dc3545)'
                        : 'var(--ui-text-secondary)',
        },
        statusText: { fontSize: 12, color: 'var(--ui-text-secondary)' },
        main: { display: 'flex', flex: 1, overflow: 'hidden' },
        treePanel: {
            width: 320,
            minWidth: 150,
            overflowY: 'auto',
            background: 'var(--ui-bg-primary)',
        },
        detailPanel: {
            flex: 1,
            minWidth: 200,
            overflowY: 'auto',
            padding: 16,
            background: 'var(--ui-bg-surface)',
        },
        statsBar: {
            padding: '8px 16px',
            background: 'var(--ui-bg-surface)',
            borderTop: '1px solid var(--ui-border)',
            display: 'flex',
            gap: 16,
            fontSize: 12,
        },
        treeItem: {
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            cursor: 'pointer',
            gap: 6,
        },
        expandIcon: {
            width: 12,
            fontSize: 10,
            textAlign: 'center',
            flexShrink: 0,
            color: 'var(--ui-text-secondary)',
        },
        statusIcon: { width: 14, textAlign: 'center', flexShrink: 0 },
        treeLabel: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        treeDuration: { fontSize: 11, color: 'var(--ui-text-secondary)' },
        detailEmpty: { color: 'var(--ui-text-secondary)', textAlign: 'center', padding: 40 },
        detailTitle: { fontSize: 16, fontWeight: 600, marginBottom: 8 },
        resultBox: {
            background: 'var(--ui-bg-primary)',
            border: '1px solid var(--ui-border)',
            borderRadius: 4,
            padding: 12,
            fontFamily: "'SF Mono', Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 400,
            overflowY: 'auto',
        },
        actionRow: { display: 'flex', gap: 8, marginTop: 12 },
    };

    const statusColorMap: Record<NodeStatus, string> = {
        ok: '#28a745',
        complete: '#28a745',
        changed: '#ce9178',
        failed: '#dc3545',
        skipped: '#808080',
        unreachable: '#dc3545',
        running: 'var(--ui-accent, #007acc)',
    };

    const renderTreeItem = (
        level: 'playbook' | 'play' | 'task' | 'host',
        label: string,
        status: NodeStatus,
        nodeId: string,
        hasChildren: boolean,
        isExpanded: boolean,
        onClick: () => void,
        durationVal?: number,
    ) => {
        const indent =
            level === 'playbook' ? 4 : level === 'play' ? 20 : level === 'task' ? 36 : 52;
        const isSelected = selected && nodeId === getNodeId(selected);
        return (
            <div
                key={nodeId}
                style={{
                    ...styles.treeItem,
                    paddingLeft: indent,
                    fontWeight: level === 'playbook' ? 600 : level === 'play' ? 500 : 400,
                    fontSize: level === 'host' ? 12 : 13,
                    background: isSelected ? 'rgba(0, 120, 212, 0.15)' : undefined,
                }}
                onClick={onClick}
            >
                <span style={styles.expandIcon}>
                    {hasChildren ? (isExpanded ? '\u25BC' : '\u25B6') : ' '}
                </span>
                <span style={{ ...styles.statusIcon, color: statusColorMap[status] }}>
                    {getStatusIcon(status)}
                </span>
                <span
                    style={{
                        ...styles.treeLabel,
                        color: status === 'failed' ? statusColorMap.failed : undefined,
                    }}
                >
                    {label}
                </span>
                {durationVal !== undefined && durationVal > 0 && (
                    <span style={styles.treeDuration}>{durationVal}s</span>
                )}
            </div>
        );
    };

    const getNodeId = (node: SelectedNode): string => {
        if (node.type === 'playbook') return 'playbook';
        if (node.type === 'play') return `play-${String(node.playIdx)}`;
        if (node.type === 'task') return `task-${String(node.playIdx)}-${String(node.taskIdx)}`;
        return `host-${String(node.playIdx)}-${String(node.taskIdx)}-${node.host}`;
    };

    const renderTree = () => {
        if (!playbookName) {
            return <div style={styles.detailEmpty}>Waiting for playbook execution&hellip;</div>;
        }

        const nodes: JSX.Element[] = [];
        const pbExpanded = expanded.has('playbook');

        nodes.push(
            renderTreeItem(
                'playbook',
                playbookName,
                playbookStatus,
                'playbook',
                plays.length > 0,
                pbExpanded,
                () => {
                    toggleExpand('playbook');
                    setSelected({ type: 'playbook' });
                },
                duration,
            ),
        );

        if (pbExpanded) {
            plays.forEach((play, pIdx) => {
                const playId = `play-${String(pIdx)}`;
                const playExpanded = expanded.has(playId);
                nodes.push(
                    renderTreeItem(
                        'play',
                        play.name,
                        play.status,
                        playId,
                        play.tasks.length > 0,
                        playExpanded,
                        () => {
                            toggleExpand(playId);
                            setSelected({ type: 'play', playIdx: pIdx });
                        },
                    ),
                );

                if (playExpanded) {
                    play.tasks.forEach((task, tIdx) => {
                        const taskId = `task-${String(pIdx)}-${String(tIdx)}`;
                        const taskExpanded = expanded.has(taskId);
                        const hostCount = Object.keys(task.hosts).length;
                        nodes.push(
                            renderTreeItem(
                                'task',
                                task.name,
                                task.status,
                                taskId,
                                hostCount > 0,
                                taskExpanded,
                                () => {
                                    toggleExpand(taskId);
                                    setSelected({ type: 'task', playIdx: pIdx, taskIdx: tIdx });
                                },
                            ),
                        );

                        if (taskExpanded) {
                            Object.entries(task.hosts).forEach(([host, hostData]) => {
                                const hostId = `host-${String(pIdx)}-${String(tIdx)}-${host}`;
                                nodes.push(
                                    renderTreeItem(
                                        'host',
                                        host,
                                        hostData.status,
                                        hostId,
                                        false,
                                        false,
                                        () => {
                                            setSelected({
                                                type: 'host',
                                                playIdx: pIdx,
                                                taskIdx: tIdx,
                                                host,
                                            });
                                        },
                                        hostData.duration,
                                    ),
                                );
                            });
                        }
                    });
                }
            });
        }

        return <>{nodes}</>;
    };

    const renderDetail = () => {
        if (!detail.data) {
            return <div style={styles.detailEmpty}>Select a node to view details</div>;
        }

        const task = detail.task;
        const isHostView = selected?.type === 'host';
        const hostData = isHostView
            ? plays[selected.playIdx].tasks[selected.taskIdx].hosts[selected.host]
            : null;

        const tabStyle = (active: boolean): CSSProperties => ({
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 500,
            color: active ? 'var(--ui-text-primary)' : 'var(--ui-text-secondary)',
            background: 'transparent',
            border: 'none',
            borderBottom: active ? '2px solid var(--ui-accent, #007acc)' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: -1,
        });

        return (
            <div>
                <div style={styles.detailTitle}>{detail.title}</div>
                {task && (
                    <div
                        style={{
                            fontSize: 12,
                            color: 'var(--ui-text-secondary)',
                            marginBottom: 12,
                        }}
                    >
                        {task.action && (
                            <span>
                                Module: <strong>{task.action}</strong>
                            </span>
                        )}
                        {hostData?.duration !== undefined && (
                            <span style={{ marginLeft: 16 }}>Duration: {hostData.duration}s</span>
                        )}
                        {hostData && (
                            <span style={{ marginLeft: 16 }}>
                                Status:{' '}
                                <strong style={{ color: statusColorMap[hostData.status] }}>
                                    {hostData.status}
                                </strong>
                            </span>
                        )}
                    </div>
                )}
                {task?.path && (
                    <div style={styles.actionRow}>
                        <button
                            type="button"
                            style={styles.headerBtn}
                            onClick={() => {
                                if (task.path) bridge.editSource(task.path);
                            }}
                        >
                            Open Source
                        </button>
                        {detail.host && (
                            <button
                                type="button"
                                style={styles.headerBtn}
                                onClick={() => {
                                    bridge.analyzeWithAi({
                                        taskName: task.name,
                                        module: task.action ?? '',
                                        host: detail.host ?? '',
                                        status: hostData?.status ?? '',
                                        args: task.args ?? {},
                                        result: hostData?.result ?? {},
                                        path: task.path ?? '',
                                    });
                                }}
                            >
                                Analyze with AI
                            </button>
                        )}
                    </div>
                )}
                {(isHostView || selected?.type === 'task') && task ? (
                    <div style={{ marginTop: 16 }}>
                        <div
                            style={{
                                display: 'flex',
                                borderBottom: '1px solid var(--ui-border)',
                                marginBottom: 0,
                            }}
                        >
                            <button
                                type="button"
                                style={tabStyle(detailTab === 'result')}
                                onClick={() => {
                                    setDetailTab('result');
                                }}
                            >
                                Result
                            </button>
                            <button
                                type="button"
                                style={tabStyle(detailTab === 'invocation')}
                                onClick={() => {
                                    setDetailTab('invocation');
                                }}
                            >
                                Invocation
                            </button>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            {detailTab === 'result' ? (
                                <YamlBlock
                                    yaml={yaml.dump(
                                        isHostView
                                            ? (hostData?.result ?? {})
                                            : Object.fromEntries(
                                                  Object.entries(task.hosts).map(([h, hd]) => [
                                                      h,
                                                      {
                                                          status: hd.status,
                                                          changed: hd.changed,
                                                          duration: hd.duration,
                                                      },
                                                  ]),
                                              ),
                                        { lineWidth: -1, noRefs: true },
                                    )}
                                />
                            ) : (
                                <YamlBlock
                                    yaml={yaml.dump(
                                        { module: task.action, args: task.args, path: task.path },
                                        { lineWidth: -1, noRefs: true },
                                    )}
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ marginTop: 16 }}>
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--ui-text-secondary)',
                                marginBottom: 8,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                            }}
                        >
                            Details
                        </div>
                        <YamlBlock yaml={yaml.dump(detail.data, { lineWidth: -1, noRefs: true })} />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.headerTitle}>{playbookName ?? bridge.playbookName}</div>
                {(runStatus === 'complete' || runStatus === 'stopped') && (
                    <button
                        type="button"
                        style={styles.headerBtn}
                        onClick={() => {
                            bridge.rerun();
                        }}
                    >
                        Run Again
                    </button>
                )}
                {runStatus === 'running' && (
                    <button
                        type="button"
                        style={styles.dangerBtn}
                        onClick={() => {
                            bridge.stopPlaybook();
                        }}
                    >
                        Stop
                    </button>
                )}
                <button
                    type="button"
                    style={styles.headerBtn}
                    onClick={() => {
                        bridge.toggleTerminal();
                    }}
                >
                    Terminal
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={styles.statusDot} />
                    <span style={styles.statusText}>
                        {runStatus === 'waiting'
                            ? 'Idle'
                            : runStatus === 'running'
                              ? 'Running'
                              : runStatus === 'stopped'
                                ? 'Stopped'
                                : 'Complete'}
                    </span>
                </div>
            </div>

            <div style={styles.main}>
                <div style={styles.treePanel}>{renderTree()}</div>
                <div style={{ width: 4, background: 'var(--ui-border)', flexShrink: 0 }} />
                <div style={styles.detailPanel}>{renderDetail()}</div>
            </div>

            {runStatus !== 'waiting' && (
                <div style={styles.statsBar}>
                    <span
                        style={{
                            fontWeight: 600,
                            color: statusColorMap[
                                runStatus === 'running'
                                    ? 'running'
                                    : playbookStatus === 'failed'
                                      ? 'failed'
                                      : 'ok'
                            ],
                        }}
                    >
                        {runStatus === 'running'
                            ? 'Running'
                            : runStatus === 'stopped'
                              ? 'Stopped'
                              : 'Finished'}
                    </span>
                    <span
                        style={{ width: 1, background: 'var(--ui-border)', alignSelf: 'stretch' }}
                    />
                    <span style={{ fontWeight: 600, color: '#28a745' }}>{stats.ok}</span> ok
                    <span style={{ fontWeight: 600, color: '#ce9178', marginLeft: 8 }}>
                        {stats.changed}
                    </span>{' '}
                    changed
                    <span style={{ fontWeight: 600, color: '#dc3545', marginLeft: 8 }}>
                        {stats.failed}
                    </span>{' '}
                    failed
                    <span style={{ fontWeight: 600, color: '#808080', marginLeft: 8 }}>
                        {stats.skipped}
                    </span>{' '}
                    skipped
                    {duration > 0 && (
                        <span style={{ marginLeft: 'auto', color: 'var(--ui-text-secondary)' }}>
                            {duration}s
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Derive aggregate task status from per-host results.
 * @param hosts - Map of host names to their execution results.
 * @returns The worst-case status across all hosts.
 */
function computeTaskStatus(hosts: Record<string, HostResult>): NodeStatus {
    const statuses = Object.values(hosts).map((h) => h.status);
    if (statuses.includes('failed') || statuses.includes('unreachable')) return 'failed';
    if (statuses.includes('changed')) return 'changed';
    if (statuses.every((s) => s === 'skipped')) return 'skipped';
    if (statuses.includes('running')) return 'running';
    return 'ok';
}

/**
 * Derive aggregate play status from its task statuses.
 * @param tasks - Array of task states in the play.
 * @returns The worst-case status across all tasks.
 */
function computePlayStatus(tasks: TaskState[]): NodeStatus {
    const statuses = tasks.map((t) => t.status);
    if (statuses.includes('failed')) return 'failed';
    if (statuses.includes('changed')) return 'changed';
    if (statuses.includes('running')) return 'running';
    if (statuses.every((s) => s === 'skipped')) return 'skipped';
    return 'ok';
}
