import { describe, it, expect } from 'vitest';
import {
    buildTaskAnalysisPrompt,
    buildPlaybookSummaryPrompt,
    type TaskAnalysisInput,
} from '../../src/prompts/playbook';

describe('buildTaskAnalysisPrompt', () => {
    const baseInput: TaskAnalysisInput = {
        taskName: 'Install httpd',
        module: 'ansible.builtin.dnf',
        host: 'webserver1',
        status: 'ok',
        args: { name: 'httpd', state: 'present' },
        result: { changed: false, msg: 'Nothing to do' },
    };

    it('includes task name, module, host, and status', () => {
        const prompt = buildTaskAnalysisPrompt(baseInput);
        expect(prompt).toContain('## Task: Install httpd');
        expect(prompt).toContain('`ansible.builtin.dnf`');
        expect(prompt).toContain('**Host:** webserver1');
        expect(prompt).toContain('**Status:** OK');
    });

    it('maps failed status correctly', () => {
        const prompt = buildTaskAnalysisPrompt({ ...baseInput, status: 'failed' });
        expect(prompt).toContain('**Status:** FAILED');
    });

    it('maps changed status correctly', () => {
        const prompt = buildTaskAnalysisPrompt({ ...baseInput, status: 'changed' });
        expect(prompt).toContain('**Status:** CHANGED');
    });

    it('includes source path when provided', () => {
        const prompt = buildTaskAnalysisPrompt({
            ...baseInput,
            path: 'roles/web/tasks/main.yml:5',
        });
        expect(prompt).toContain('**Source:** `roles/web/tasks/main.yml:5`');
        expect(prompt).toContain('Read the source file at `roles/web/tasks/main.yml:5`');
    });

    it('omits source section when path is undefined', () => {
        const prompt = buildTaskAnalysisPrompt(baseInput);
        expect(prompt).not.toContain('**Source:**');
        expect(prompt).toContain('Analyze the task in isolation');
    });

    it('strips _ansible_ prefixed keys from result', () => {
        const input: TaskAnalysisInput = {
            ...baseInput,
            result: { msg: 'ok', _ansible_no_log: false, invocation: { module_args: {} } },
        };
        const prompt = buildTaskAnalysisPrompt(input);
        expect(prompt).toContain('"msg"');
        expect(prompt).not.toContain('_ansible_no_log');
        expect(prompt).not.toContain('"invocation"');
    });

    it('serializes args as JSON', () => {
        const prompt = buildTaskAnalysisPrompt(baseInput);
        expect(prompt).toContain('"name": "httpd"');
        expect(prompt).toContain('"state": "present"');
    });

    it('includes MCP tool instruction for module docs', () => {
        const prompt = buildTaskAnalysisPrompt(baseInput);
        expect(prompt).toContain('`get_plugin_doc`');
        expect(prompt).toContain('`ansible.builtin.dnf`');
    });
});

describe('buildPlaybookSummaryPrompt', () => {
    it('includes the relative path and playbook name', () => {
        const prompt = buildPlaybookSummaryPrompt('playbooks/deploy.yml', 'deploy.yml');
        expect(prompt).toContain('"playbooks/deploy.yml"');
        expect(prompt).toContain('Playbook: deploy.yml');
    });

    it('contains structural analysis instructions', () => {
        const prompt = buildPlaybookSummaryPrompt('site.yml', 'site.yml');
        expect(prompt).toContain('Read the playbook file');
        expect(prompt).toContain('Follow all imports');
        expect(prompt).toContain('Examine all roles');
        expect(prompt).toContain('List all tasks in order');
    });

    it('includes collection audit instructions', () => {
        const prompt = buildPlaybookSummaryPrompt('site.yml', 'site.yml');
        expect(prompt).toContain('`list_collections`');
        expect(prompt).toContain('`install_collection`');
    });

    it('includes required output sections', () => {
        const prompt = buildPlaybookSummaryPrompt('site.yml', 'site.yml');
        expect(prompt).toContain('### Executive Summary');
        expect(prompt).toContain('### Hierarchical Structure');
        expect(prompt).toContain('### Collections Used');
        expect(prompt).toContain('### Other Dependencies');
    });
});
