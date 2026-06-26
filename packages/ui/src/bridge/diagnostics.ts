import type { HostBridgeCore } from './core';

/**
 * Python environment information for the diagnostics view.
 */
export interface DiagnosticsPython {
    envName?: string;
    version?: string;
    path?: string;
}

/**
 * Ansible runtime information for the diagnostics view.
 */
export interface DiagnosticsAnsible {
    version?: string;
}

/**
 * A single tool entry from `adt --version` output.
 */
export interface DiagnosticsTool {
    name: string;
    version: string;
}

/**
 * Service status (language server, MCP server).
 */
export interface DiagnosticsService {
    name: string;
    status: 'running' | 'stopped' | 'configured' | 'not configured';
}

/**
 * Complete diagnostics payload returned by the bridge.
 */
export interface DiagnosticsData {
    workspacePath?: string;
    python: DiagnosticsPython;
    ansible: DiagnosticsAnsible;
    services: DiagnosticsService[];
    tools: DiagnosticsTool[];
}

/**
 * Bridge contract for the diagnostics view.
 * Host implementations gather data from status bars, services,
 * and CLI tools; standalone apps may use REST APIs.
 */
export interface DiagnosticsBridge extends HostBridgeCore {
    getDiagnostics(): Promise<DiagnosticsData>;
    changePythonEnvironment(): void;
    upgradeDevTools(): void;
    resyncMetadata(): void;
    openOutput(): void;
}
