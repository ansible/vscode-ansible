import { describe, it, expect } from 'vitest';
import {
    getPositionalKeys,
    quoteIfNeeded,
    valueToString,
    buildCommandArgs,
    buildPreviewString,
    formatLabel,
    resolveSchemaNode,
    withPrefilledDefault,
    resolveDevcontainerFormPlan,
    DEVCONTAINER_COMMAND_PATH,
    CREATOR_FILTERED_KEYS,
} from '../../src/utils/creatorArgs';
import type { SchemaNode } from '../../src/types/creator';

const LEAF_SCHEMA: SchemaNode = {
    name: 'playbook',
    description: 'Initialize a playbook project',
    parameters: {
        type: 'object',
        properties: {
            project: { type: 'string', description: 'Project name' },
            'scm-org': {
                type: 'string',
                description: 'SCM org',
                aliases: ['--scm-org'],
            },
            'scm-project': {
                type: 'string',
                description: 'SCM project',
                aliases: ['--scm-project'],
            },
            output: {
                type: 'string',
                description: 'Output directory',
                default: './',
                aliases: ['-o', '--output'],
            },
            overwrite: {
                type: 'boolean',
                description: 'Overwrite existing files',
                aliases: ['--overwrite'],
            },
        },
        required: ['project'],
    },
};

describe('creatorArgs', () => {
    describe('CREATOR_FILTERED_KEYS', () => {
        it('contains expected noise parameters', () => {
            expect(CREATOR_FILTERED_KEYS).toContain('no_ansi');
            expect(CREATOR_FILTERED_KEYS).toContain('verbose');
            expect(CREATOR_FILTERED_KEYS).toContain('json');
        });
    });

    describe('getPositionalKeys', () => {
        it('returns params without aliases', () => {
            expect(getPositionalKeys(LEAF_SCHEMA)).toEqual(['project']);
        });

        it('returns empty array for schema without parameters', () => {
            expect(getPositionalKeys({ name: 'empty' })).toEqual([]);
        });
    });

    describe('quoteIfNeeded', () => {
        it('returns plain value when no special chars', () => {
            expect(quoteIfNeeded('hello')).toBe('hello');
        });

        it('quotes values with spaces', () => {
            expect(quoteIfNeeded('hello world')).toBe('"hello world"');
        });

        it('escapes double quotes inside value', () => {
            expect(quoteIfNeeded('say "hi"')).toBe('"say \\"hi\\""');
        });

        it('quotes values with single quotes', () => {
            expect(quoteIfNeeded("it's")).toBe('"it\'s"');
        });
    });

    describe('valueToString', () => {
        it('returns string values as-is', () => {
            expect(valueToString('hello')).toBe('hello');
        });

        it('converts numbers to strings', () => {
            expect(valueToString(42)).toBe('42');
        });

        it('converts booleans to strings', () => {
            expect(valueToString(true)).toBe('true');
        });

        it('JSON-stringifies objects', () => {
            expect(valueToString({ a: 1 })).toBe('{"a":1}');
        });
    });

    describe('buildCommandArgs', () => {
        it('places positional args before flags', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'myproj',
                'scm-org': 'acme',
            });
            expect(args).toEqual(['init', 'playbook', 'myproj', '--scm-org', 'acme']);
        });

        it('uses preferred long flag from aliases', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                output: '/tmp/out',
            });
            expect(args).toEqual(['init', 'playbook', 'p', '--output', '/tmp/out']);
        });

        it('emits boolean flags only when true', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                overwrite: true,
            });
            expect(args).toContain('--overwrite');
        });

        it('skips false boolean flags', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                overwrite: false,
            });
            expect(args).not.toContain('--overwrite');
        });

        it('skips empty/null/undefined values', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                'scm-org': '',
                'scm-project': undefined,
            });
            expect(args).toEqual(['init', 'playbook', 'p']);
        });

        it('falls back to --key for unknown params', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                custom: 'val',
            });
            expect(args).toContain('--custom');
            expect(args).toContain('val');
        });

        it('preserves values with spaces as single args', () => {
            const args = buildCommandArgs(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'my project',
            });
            expect(args).toContain('my project');
        });
    });

    describe('buildPreviewString', () => {
        it('prefixes with ansible-creator', () => {
            const preview = buildPreviewString(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'myproj',
            });
            expect(preview).toMatch(/^ansible-creator init playbook/);
        });

        it('omits optional flags at their default value', () => {
            const preview = buildPreviewString(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                output: './',
            });
            expect(preview).toBe('ansible-creator init playbook p');
        });

        it('includes optional flags when differing from default', () => {
            const preview = buildPreviewString(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                output: '/custom',
            });
            expect(preview).toContain('--output /custom');
        });

        it('skips false boolean values', () => {
            const preview = buildPreviewString(['init', 'playbook'], LEAF_SCHEMA, {
                project: 'p',
                overwrite: false,
            });
            expect(preview).not.toContain('overwrite');
        });
    });

    describe('resolveSchemaNode', () => {
        const DEVCONTAINER_SCHEMA: SchemaNode = {
            name: 'add',
            subcommands: {
                resource: {
                    name: 'resource',
                    subcommands: {
                        devcontainer: {
                            name: 'devcontainer',
                            description: 'Add a devcontainer config',
                            parameters: {
                                type: 'object',
                                properties: {
                                    image: {
                                        type: 'string',
                                        description: 'Execution environment image',
                                    },
                                },
                                required: ['image'],
                            },
                        },
                    },
                },
            },
        };

        it('resolves a nested subcommand path', () => {
            const node = resolveSchemaNode(DEVCONTAINER_SCHEMA, ['resource', 'devcontainer']);
            expect(node?.name).toBe('devcontainer');
        });

        it('returns the root node for an empty path', () => {
            expect(resolveSchemaNode(DEVCONTAINER_SCHEMA, [])).toBe(DEVCONTAINER_SCHEMA);
        });

        it('returns undefined when a middle segment is missing', () => {
            expect(
                resolveSchemaNode(DEVCONTAINER_SCHEMA, ['missing', 'devcontainer']),
            ).toBeUndefined();
        });

        it('returns undefined when the final segment is missing', () => {
            expect(resolveSchemaNode(DEVCONTAINER_SCHEMA, ['resource', 'missing'])).toBeUndefined();
        });

        it('returns undefined when a leaf node has no subcommands', () => {
            const node = resolveSchemaNode(DEVCONTAINER_SCHEMA, [
                'resource',
                'devcontainer',
                'extra',
            ]);
            expect(node).toBeUndefined();
        });
    });

    describe('withPrefilledDefault', () => {
        it('sets prefill without changing the schema default or mutating the input', () => {
            const prefilled = withPrefilledDefault(LEAF_SCHEMA, 'output', '/prefilled');
            expect(prefilled.parameters?.properties.output.prefill).toBe('/prefilled');
            expect(prefilled.parameters?.properties.output.default).toBe('./');
            expect(LEAF_SCHEMA.parameters?.properties.output.default).toBe('./');
            expect(LEAF_SCHEMA.parameters?.properties.output.prefill).toBeUndefined();
            expect(prefilled).not.toBe(LEAF_SCHEMA);
        });

        it('preserves other parameters and required list untouched', () => {
            const prefilled = withPrefilledDefault(LEAF_SCHEMA, 'output', '/prefilled');
            expect(prefilled.parameters?.required).toEqual(LEAF_SCHEMA.parameters?.required);
            expect(prefilled.parameters?.properties.project).toEqual(
                LEAF_SCHEMA.parameters?.properties.project,
            );
        });

        it('keeps prefilled values visible in the command preview', () => {
            const schema: SchemaNode = {
                name: 'devcontainer',
                parameters: {
                    type: 'object',
                    properties: {
                        image: {
                            type: 'string',
                            description: 'EE image',
                            default: 'auto',
                            aliases: ['--image'],
                        },
                    },
                    required: ['image'],
                },
            };
            const prefilled = withPrefilledDefault(schema, 'image', 'quay.io/ee/example:latest');
            const preview = buildPreviewString(['add', 'resource', 'devcontainer'], prefilled, {
                image: 'quay.io/ee/example:latest',
            });
            expect(preview).toContain('--image quay.io/ee/example:latest');
        });

        it('returns the original schema unchanged when the key does not exist', () => {
            const prefilled = withPrefilledDefault(LEAF_SCHEMA, 'nonexistent', 'value');
            expect(prefilled).toBe(LEAF_SCHEMA);
        });

        it('returns the original schema unchanged when there are no parameters', () => {
            const schema: SchemaNode = { name: 'empty' };
            expect(withPrefilledDefault(schema, 'image', 'value')).toBe(schema);
        });
    });

    describe('resolveDevcontainerFormPlan', () => {
        const ROOT_SCHEMA: SchemaNode = {
            name: 'ansible-creator',
            subcommands: {
                add: {
                    name: 'add',
                    subcommands: {
                        resource: {
                            name: 'resource',
                            subcommands: {
                                devcontainer: {
                                    name: 'devcontainer',
                                    description: 'Add a devcontainer config',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            image: {
                                                type: 'string',
                                                description: 'Execution environment image',
                                            },
                                        },
                                        required: ['image'],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        it('no-ops when no EE was selected', () => {
            expect(resolveDevcontainerFormPlan(undefined, ROOT_SCHEMA)).toEqual({
                kind: 'noop',
            });
        });

        it('no-ops when no EE was selected even without a schema', () => {
            expect(resolveDevcontainerFormPlan(undefined, undefined)).toEqual({ kind: 'noop' });
        });

        it('errors when ansible-creator schema is unavailable', () => {
            const plan = resolveDevcontainerFormPlan('quay.io/ee/example:latest', undefined);
            expect(plan.kind).toBe('error');
            if (plan.kind === 'error') {
                expect(plan.message).toMatch(/ansible-creator not found/);
            }
        });

        it('errors with upgrade guidance when ansible-creator is outdated', () => {
            const plan = resolveDevcontainerFormPlan(
                'quay.io/ee/example:latest',
                undefined,
                'outdated',
            );
            expect(plan.kind).toBe('error');
            if (plan.kind === 'error') {
                expect(plan.message).toMatch(/outdated/);
                expect(plan.message).toMatch(/Upgrade/);
            }
        });

        it('errors when the schema does not support add resource devcontainer', () => {
            const plan = resolveDevcontainerFormPlan('quay.io/ee/example:latest', {
                name: 'add',
            });
            expect(plan.kind).toBe('error');
            if (plan.kind === 'error') {
                expect(plan.message).toMatch(/does not support/);
            }
        });

        it('opens the form with the resolved command path and prefilled image', () => {
            const plan = resolveDevcontainerFormPlan('quay.io/ee/example:latest', ROOT_SCHEMA);
            expect(plan.kind).toBe('open');
            if (plan.kind === 'open') {
                expect(plan.commandPath).toEqual(DEVCONTAINER_COMMAND_PATH);
                expect(plan.schema.parameters?.properties.image.prefill).toBe(
                    'quay.io/ee/example:latest',
                );
                expect(plan.schema.parameters?.properties.image.default).toBeUndefined();
            }
        });

        it('does not mutate the original schema', () => {
            resolveDevcontainerFormPlan('quay.io/ee/example:latest', ROOT_SCHEMA);
            const devcontainerNode = resolveSchemaNode(ROOT_SCHEMA, DEVCONTAINER_COMMAND_PATH);
            expect(devcontainerNode?.parameters?.properties.image.prefill).toBeUndefined();
        });
    });

    describe('formatLabel', () => {
        it('converts snake_case to Title Case', () => {
            expect(formatLabel('scm_org')).toBe('Scm Org');
        });

        it('converts kebab-case to Title Case', () => {
            expect(formatLabel('init-path')).toBe('Init Path');
        });

        it('handles single word', () => {
            expect(formatLabel('project')).toBe('Project');
        });
    });
});
