import { describe, it, expect } from 'vitest';
import { generateSampleYaml, capitalizeTitle, formatYamlValue } from '../../src/utils/sample-task';
import type { PluginOption } from '../../src/bridge/plugin-doc';

describe('capitalizeTitle', () => {
    it('capitalizes first letter of each word', () => {
        expect(capitalizeTitle('hello world')).toBe('Hello World');
    });

    it('returns empty string for empty input', () => {
        expect(capitalizeTitle('')).toBe('');
    });

    it('handles single word', () => {
        expect(capitalizeTitle('test')).toBe('Test');
    });

    it('preserves already capitalized words', () => {
        expect(capitalizeTitle('Hello World')).toBe('Hello World');
    });
});

describe('formatYamlValue', () => {
    it('formats null', () => {
        expect(formatYamlValue(null)).toBe('null');
    });

    it('formats undefined', () => {
        expect(formatYamlValue(undefined)).toBe('null');
    });

    it('formats boolean true', () => {
        expect(formatYamlValue(true)).toBe('true');
    });

    it('formats boolean false', () => {
        expect(formatYamlValue(false)).toBe('false');
    });

    it('formats numbers', () => {
        expect(formatYamlValue(42)).toBe('42');
        expect(formatYamlValue(3.14)).toBe('3.14');
    });

    it('formats plain string without quotes', () => {
        expect(formatYamlValue('hello')).toBe('hello');
    });

    it('quotes strings containing colons', () => {
        expect(formatYamlValue('key: value')).toBe('"key: value"');
    });

    it('quotes strings that look like booleans', () => {
        expect(formatYamlValue('true')).toBe('"true"');
        expect(formatYamlValue('yes')).toBe('"yes"');
    });

    it('quotes strings that look like numbers', () => {
        expect(formatYamlValue('42')).toBe('"42"');
    });

    it('quotes empty string', () => {
        expect(formatYamlValue('')).toBe('""');
    });

    it('formats empty array', () => {
        expect(formatYamlValue([])).toBe('[]');
    });

    it('formats non-empty array as JSON', () => {
        expect(formatYamlValue([1, 2])).toBe('[1,2]');
    });

    it('formats empty object', () => {
        expect(formatYamlValue({})).toBe('{}');
    });

    it('formats non-empty object as JSON', () => {
        expect(formatYamlValue({ a: 1 })).toBe('{"a":1}');
    });
});

describe('generateSampleYaml', () => {
    it('generates basic task structure', () => {
        const options: Record<string, PluginOption> = {
            name: { type: 'str', required: true },
        };
        const yaml = generateSampleYaml('ansible.builtin.copy', options, 'none');
        expect(yaml).toContain('- name: Copy task');
        expect(yaml).toContain('  ansible.builtin.copy:');
        expect(yaml).toContain('    name:');
    });

    it('sorts required parameters before optional', () => {
        const options: Record<string, PluginOption> = {
            optional_param: { type: 'str' },
            required_param: { type: 'str', required: true },
        };
        const yaml = generateSampleYaml('test.module', options, 'none');
        const lines = yaml.split('\n');
        const reqIdx = lines.findIndex((l) => l.includes('required_param'));
        const optIdx = lines.findIndex((l) => l.includes('optional_param'));
        expect(reqIdx).toBeLessThan(optIdx);
    });

    it('adds "# optional" comments in optional mode', () => {
        const options: Record<string, PluginOption> = {
            param: { type: 'str' },
        };
        const yaml = generateSampleYaml('test.module', options, 'optional');
        expect(yaml).toContain('# optional');
    });

    it('does not add comments for required in optional mode', () => {
        const options: Record<string, PluginOption> = {
            param: { type: 'str', required: true },
        };
        const yaml = generateSampleYaml('test.module', options, 'optional');
        expect(yaml).not.toContain('# optional');
        expect(yaml).not.toContain('# required');
    });

    it('adds description comments in descriptions mode', () => {
        const options: Record<string, PluginOption> = {
            name: { type: 'str', required: true, description: 'The resource name' },
        };
        const yaml = generateSampleYaml('test.module', options, 'descriptions');
        expect(yaml).toContain('# (str, required)');
        expect(yaml).toContain('The resource name');
    });

    it('omits all comments in none mode', () => {
        const options: Record<string, PluginOption> = {
            name: { type: 'str', description: 'The name' },
        };
        const yaml = generateSampleYaml('test.module', options, 'none');
        expect(yaml).not.toContain('#');
    });

    it('generates list parameters with element items', () => {
        const options: Record<string, PluginOption> = {
            tags: { type: 'list', elements: 'str' },
        };
        const yaml = generateSampleYaml('test.module', options, 'none');
        expect(yaml).toContain('tags:');
        expect(yaml).toContain('- "tags_item"');
    });

    it('generates boolean default value', () => {
        const options: Record<string, PluginOption> = {
            enabled: { type: 'bool', default: false },
        };
        const yaml = generateSampleYaml('test.module', options, 'none');
        expect(yaml).toContain('enabled: false');
    });

    it('uses first choice when available', () => {
        const options: Record<string, PluginOption> = {
            state: { type: 'str', choices: ['present', 'absent'] },
        };
        const yaml = generateSampleYaml('test.module', options, 'none');
        expect(yaml).toContain('state: present');
    });

    it('generates suboptions as nested dict', () => {
        const options: Record<string, PluginOption> = {
            config: {
                type: 'dict',
                suboptions: {
                    host: { type: 'str', required: true },
                    port: { type: 'int' },
                },
            },
        };
        const yaml = generateSampleYaml('test.module', options, 'none');
        expect(yaml).toContain('config:');
        expect(yaml).toContain('host:');
        expect(yaml).toContain('port:');
    });

    it('truncates long descriptions to 60 chars', () => {
        const options: Record<string, PluginOption> = {
            param: {
                type: 'str',
                description:
                    'This is a very long description that exceeds sixty characters and should be truncated',
            },
        };
        const yaml = generateSampleYaml('test.module', options, 'descriptions');
        const commentLine = yaml.split('\n').find((l) => l.includes('#'));
        expect(commentLine).toBeDefined();
        expect(commentLine?.includes('...')).toBe(true);
    });

    it('capitalizes plugin name for task name', () => {
        const yaml = generateSampleYaml('ns.col.my_task', {}, 'none');
        expect(yaml).toContain('- name: My Task task');
    });
});
