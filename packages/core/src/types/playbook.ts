/**
 * Shared playbook types used across extension, MCP server, and UI.
 */

/** Run settings for ansible-playbook. */
export interface PlaybookConfig {
    inventory?: string[];
    limit?: string;
    tags?: string[];
    skipTags?: string[];
    extraVars?: string;
    check?: boolean;
    diff?: boolean;
    verbose?: number;
    forks?: number;
    connection?: string;
    user?: string;
    timeout?: number;
    privateKey?: string;
    become?: boolean;
    becomeMethod?: string;
    becomeUser?: string;
    vaultPasswordFile?: string;
    startAtTask?: string;
    step?: boolean;
    askPass?: boolean;
    askBecomePass?: boolean;
    askVaultPass?: boolean;
}

/** A single play parsed from a playbook YAML file. */
export interface PlaybookPlay {
    name: string;
    hosts: string;
    lineNumber: number;
}

/** Streaming event from the ansible-playbook callback plugin. */
export interface ProgressEvent {
    type: ProgressEventType;
    timestamp: string;
    data: Record<string, unknown>;
}

/** Known progress event types emitted by vscode_progress callback plugin. */
export type ProgressEventType =
    | 'playbook_start'
    | 'play_start'
    | 'task_start'
    | 'host_task_start'
    | 'host_ok'
    | 'host_failed'
    | 'host_skipped'
    | 'host_unreachable'
    | 'host_retry'
    | 'item_ok'
    | 'item_failed'
    | 'item_skipped'
    | 'include'
    | 'file_diff'
    | 'playbook_complete';

/** Data passed to AI analysis for a specific task result. */
export interface AiAnalyzeData {
    taskName: string;
    module: string;
    host: string;
    status: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    path?: string;
}

/** VS Code-free run options for launching a playbook. */
export interface PlaybookRunOptions {
    playbookPath: string;
    playbookName: string;
    workspaceFolder: string;
    command: string;
    extensionPath: string;
}
