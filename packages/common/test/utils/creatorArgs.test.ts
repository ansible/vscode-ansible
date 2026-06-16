import { describe, it, expect } from 'vitest';
import {
    getPositionalKeys,
    quoteIfNeeded,
    valueToString,
    buildCommandArgs,
    buildPreviewString,
    formatLabel,
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
