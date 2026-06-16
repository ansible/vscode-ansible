import type { HostBridgeCore } from './core';
import type { PlaybookConfig, ProgressEvent, AiAnalyzeData } from '@ansible/core';

/**
 * Bridge contract for the playbook configuration form view.
 * Hosts load/save config via workspace cache, build command previews,
 * and run playbooks via TerminalService.
 */
export interface PlaybookConfigBridge extends HostBridgeCore {
    loadConfig(): Promise<PlaybookConfig>;
    saveConfig(config: PlaybookConfig): Promise<void>;
    runPlaybook(config: PlaybookConfig): Promise<void>;
    resetToDefaults(): Promise<PlaybookConfig>;
    buildPreview(config: PlaybookConfig): string;
    workspacePath: string;
    isGlobal: boolean;
    playbookName: string;
    playbookPath: string;
}

/**
 * Bridge contract for the streaming playbook progress view.
 * Events are pushed from the host's Unix socket server to the webview
 * via the onEvent subscription.
 */
export interface PlaybookProgressBridge extends HostBridgeCore {
    onEvent(cb: (event: ProgressEvent) => void): () => void;
    onStopped(cb: () => void): () => void;
    toggleTerminal(): void;
    stopPlaybook(): void;
    rerun(): void;
    editSource(path: string): void;
    analyzeWithAi(data: AiAnalyzeData): void;
    playbookName: string;
}
