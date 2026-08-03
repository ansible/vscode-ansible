/**
 * Types for ansible-creator schema and scaffolding.
 */

/** Schema for a command parameter. */
export interface ParameterSchema {
    type: string;
    description: string;
    default?: unknown;
    /**
     * Optional initial form value that does not replace `default`.
     * Used to prefill Creator fields (e.g. EE `--image`) while keeping
     * preview/default-hint behavior tied to the real schema default.
     */
    prefill?: unknown;
    enum?: string[];
    aliases?: string[];
}

/** Schema node representing a command or subcommand. */
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

/** Readiness state of the ansible-creator installation. */
export type CreatorStatus = 'unknown' | 'not-installed' | 'outdated' | 'ready';
