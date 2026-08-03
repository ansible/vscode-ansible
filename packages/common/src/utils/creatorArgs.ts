import type { CreatorStatus, SchemaNode } from '../types/creator';

/** Schema parameter keys omitted from creator form UI. */
export const CREATOR_FILTERED_KEYS = [
    'no_ansi',
    'log_file',
    'log_level',
    'log_append',
    'json',
    'verbose',
];

/**
 * Returns parameter names that should be treated as positional (no aliases).
 *
 * @param schema - Command schema node whose parameters are inspected.
 * @returns Positional parameter keys in schema property order.
 */
export function getPositionalKeys(schema: SchemaNode): string[] {
    const keys: string[] = [];
    if (schema.parameters?.properties) {
        for (const [name, param] of Object.entries(schema.parameters.properties)) {
            if (!param.aliases || param.aliases.length === 0) {
                keys.push(name);
            }
        }
    }
    return keys;
}

/**
 * Shell-safe quoting for values containing spaces or quotes.
 *
 * @param value - Raw argument value.
 * @returns Quoted value when shell escaping is required.
 */
export function quoteIfNeeded(value: string): string {
    if (value.includes(' ') || value.includes('"') || value.includes("'")) {
        return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
}

/**
 * Converts any form value to a CLI string.
 *
 * @param value - Form field value of any supported type.
 * @returns String representation suitable for CLI arguments.
 */
export function valueToString(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
}

/**
 * Picks the preferred flag from aliases (prefers `--long` form, strips placeholders).
 *
 * @param aliases - CLI aliases from the schema parameter.
 * @returns Primary flag token without placeholder suffix.
 */
function getPreferredFlag(aliases: string[]): string {
    const flag = aliases.find((a) => a.startsWith('--')) ?? aliases[0];
    return flag.split(' ')[0];
}

/**
 * Builds canonical CLI argument tokens (excluding the `ansible-creator` executable).
 *
 * @param path - Command path segments after `ansible-creator`.
 * @param schema - Command schema node for parameter metadata.
 * @param values - Form values keyed by parameter name.
 * @returns Ordered CLI argument tokens.
 */
export function buildCommandArgs(
    path: string[],
    schema: SchemaNode,
    values: Record<string, unknown>,
): string[] {
    const args: string[] = [...path];
    const properties = schema.parameters?.properties;
    const positionalKeys = getPositionalKeys(schema);
    const usedKeys = new Set<string>();

    for (const key of positionalKeys) {
        const value = values[key];
        if (value === undefined || value === null || value === '') {
            continue;
        }
        args.push(valueToString(value));
        usedKeys.add(key);
    }

    for (const [key, value] of Object.entries(values)) {
        if (usedKeys.has(key)) {
            continue;
        }
        if (value === undefined || value === null || value === '') {
            continue;
        }
        if (Array.isArray(value) && value.length === 0) {
            continue;
        }

        const prop = properties?.[key];

        if (typeof value === 'boolean') {
            if (value) {
                if (prop?.aliases?.length) {
                    args.push(getPreferredFlag(prop.aliases));
                } else {
                    args.push(`--${key}`);
                }
            }
        } else if (Array.isArray(value)) {
            const flag = prop?.aliases?.length ? getPreferredFlag(prop.aliases) : `--${key}`;
            for (const item of value) {
                if (item !== undefined && item !== null && item !== '') {
                    args.push(flag, String(item));
                }
            }
        } else {
            const flag = prop?.aliases?.length ? getPreferredFlag(prop.aliases) : `--${key}`;
            args.push(flag, valueToString(value));
        }
    }

    return args;
}

/**
 * Builds a preview command string, omitting optional flags at their schema defaults.
 *
 * @param path - Command path segments after `ansible-creator`.
 * @param schema - Command schema node for parameter metadata.
 * @param values - Form values keyed by parameter name.
 * @returns Full `ansible-creator` command string for display.
 */
export function buildPreviewString(
    path: string[],
    schema: SchemaNode,
    values: Record<string, unknown>,
): string {
    const args: string[] = [...path];
    const properties = schema.parameters?.properties;
    const positionalKeys = getPositionalKeys(schema);
    const usedKeys = new Set<string>();

    for (const key of positionalKeys) {
        const value = values[key];
        if (value === undefined || value === null || value === '') {
            continue;
        }
        args.push(quoteIfNeeded(valueToString(value)));
        usedKeys.add(key);
    }

    for (const [key, value] of Object.entries(values)) {
        if (usedKeys.has(key)) {
            continue;
        }
        if (value === undefined || value === null || value === '' || value === false) {
            continue;
        }

        const prop = properties?.[key];

        if (value === prop?.default) {
            continue;
        }

        if (typeof value === 'boolean' && value) {
            if (prop?.aliases?.length) {
                args.push(getPreferredFlag(prop.aliases));
            } else {
                args.push(`--${key}`);
            }
        } else if (Array.isArray(value)) {
            if (value.length > 0) {
                const flag = prop?.aliases?.length ? getPreferredFlag(prop.aliases) : `--${key}`;
                for (const item of value) {
                    if (item !== undefined && item !== null && item !== '') {
                        args.push(flag, quoteIfNeeded(String(item)));
                    }
                }
            }
        } else if (typeof value !== 'boolean') {
            const flag = prop?.aliases?.length ? getPreferredFlag(prop.aliases) : `--${key}`;
            args.push(flag, quoteIfNeeded(valueToString(value)));
        }
    }

    return `ansible-creator ${args.join(' ')}`;
}

/**
 * Walks a chain of subcommand segments starting at a root schema node.
 *
 * @param root - Root schema node to start the traversal from.
 * @param path - Subcommand path segments (e.g. `['add', 'resource', 'devcontainer']`).
 * @returns The resolved schema node, or `undefined` if any segment is missing.
 */
export function resolveSchemaNode(root: SchemaNode, path: string[]): SchemaNode | undefined {
    let node: SchemaNode | undefined = root;
    for (const segment of path) {
        node = node.subcommands?.[segment];
        if (!node) {
            return undefined;
        }
    }
    return node;
}

/**
 * Returns a copy of a schema node with one parameter's `prefill` set, leaving
 * the original node and its schema `default` untouched. Useful for seeding a
 * Creator form field (e.g. `image`) from calling context without making
 * `buildPreviewString` treat the value as the schema default (and omit it).
 *
 * @param schema - Schema node whose parameter should be prefilled.
 * @param key - Parameter name to prefill.
 * @param value - Initial form value for the parameter.
 * @returns A new schema node with `prefill` applied, or the original node
 * unchanged if it has no matching parameter.
 */
export function withPrefilledDefault(schema: SchemaNode, key: string, value: unknown): SchemaNode {
    const parameters = schema.parameters;
    const property = parameters?.properties[key];
    if (!parameters || !property) {
        return schema;
    }
    return {
        ...schema,
        parameters: {
            type: parameters.type,
            required: parameters.required,
            properties: {
                ...parameters.properties,
                [key]: { ...property, prefill: value },
            },
        },
    };
}

/** ansible-creator subcommand path for scaffolding a Dev Container. */
export const DEVCONTAINER_COMMAND_PATH = ['add', 'resource', 'devcontainer'];

/** Outcome of resolving an EE → Dev Container creator-form request. */
export type DevcontainerFormPlan =
    | { kind: 'noop' }
    | { kind: 'error'; message: string }
    | { kind: 'open'; commandPath: string[]; schema: SchemaNode };

/**
 * Resolves what the "Add Dev Container" EE command should do, keeping the
 * VS Code command handler a thin registration. Prefills the resolved
 * schema's `image` field with the selected EE so the Creator form opens
 * ready to submit (without changing the schema `default`).
 *
 * @param eeName - Full name of the selected EE image, or undefined when the
 * command was not invoked from a valid EE tree node.
 * @param rootSchema - ansible-creator root schema, or undefined when
 * ansible-creator is not installed or the schema failed to load.
 * @param creatorStatus - Optional readiness status from CreatorService when
 * `rootSchema` is missing, used to distinguish "not installed" from "outdated".
 * @returns A no-op when no EE was selected, an error when ansible-creator is
 * missing `add resource devcontainer`, or an open plan with the resolved
 * command path and image-prefilled schema.
 */
export function resolveDevcontainerFormPlan(
    eeName: string | undefined,
    rootSchema: SchemaNode | undefined,
    creatorStatus?: CreatorStatus,
): DevcontainerFormPlan {
    if (!eeName) {
        return { kind: 'noop' };
    }
    if (!rootSchema) {
        if (creatorStatus === 'outdated') {
            return {
                kind: 'error',
                message:
                    'ansible-creator is outdated and cannot load its schema. Upgrade ansible-dev-tools to scaffold a Dev Container.',
            };
        }
        return {
            kind: 'error',
            message:
                'ansible-creator not found. Install ansible-dev-tools to scaffold a Dev Container.',
        };
    }
    const schemaNode = resolveSchemaNode(rootSchema, DEVCONTAINER_COMMAND_PATH);
    if (!schemaNode) {
        return {
            kind: 'error',
            message:
                'ansible-creator does not support `add resource devcontainer`. Upgrade ansible-dev-tools.',
        };
    }
    return {
        kind: 'open',
        commandPath: [...DEVCONTAINER_COMMAND_PATH],
        schema: withPrefilledDefault(schemaNode, 'image', eeName),
    };
}

/**
 * Converts a parameter key to a human-readable label.
 *
 * @param name - Schema parameter name (snake_case or kebab-case).
 * @returns Title-cased label for form display.
 */
export function formatLabel(name: string): string {
    return name
        .split(/[_-]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
