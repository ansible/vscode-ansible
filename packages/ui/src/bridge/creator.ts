import type { HostBridgeCore } from './core';

/**
 * Schema for a command parameter from ansible-creator.
 */
export interface ParameterSchema {
    type: string;
    description: string;
    default?: unknown;
    enum?: string[];
    aliases?: string[];
}

/**
 * Schema node representing an ansible-creator command or subcommand.
 */
export interface SchemaNode {
    name: string;
    description?: string;
    parameters?: {
        type: string;
        properties: Record<string, ParameterSchema>;
        required: string[];
    };
    subcommands?: Record<string, SchemaNode>;
}

/** Payload sent when execution begins. */
export interface ExecutionStartedEvent {
    command: string;
}

/** Payload sent when execution completes. */
export interface ExecutionFinishedEvent {
    exitCode: number;
    output: string;
}

/**
 * Bridge contract for creator form views.
 * Host implementations execute commands via CommandService (VS Code)
 * or direct process spawning (standalone).
 */
export interface CreatorBridge extends HostBridgeCore {
    /** Run the ansible-creator command with the given form values. */
    execute(commandPath: string[], values: Record<string, unknown>): Promise<void>;
    /** Close the creator form panel. */
    cancel(): void;
    /** Workspace root path for pre-filling path fields. */
    workspacePath: string;
    /** Subscribe to execution lifecycle events. Returns an unsubscribe function. */
    onExecutionStarted(cb: (event: ExecutionStartedEvent) => void): () => void;
    onExecutionFinished(cb: (event: ExecutionFinishedEvent) => void): () => void;
}
