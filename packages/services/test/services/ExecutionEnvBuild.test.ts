import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
    isExecutionEnvironmentDefinition,
    planAnsibleBuilderBuild,
    formatAnsibleBuilderShellCommand,
    shellQuote,
} from '../../src/ExecutionEnvBuild';

describe('ExecutionEnvBuild', () => {
    it('recognizes execution-environment definition basenames', () => {
        expect(isExecutionEnvironmentDefinition('/tmp/execution-environment.yml')).toBe(true);
        expect(isExecutionEnvironmentDefinition('/tmp/execution-environment.yaml')).toBe(true);
        expect(isExecutionEnvironmentDefinition('/tmp/playbook.yml')).toBe(false);
    });

    it('plans ansible-builder args with default context directory', () => {
        const plan = planAnsibleBuilderBuild({
            filePath: '/workspace/ee/execution-environment.yml',
        });

        expect(plan.cwd).toBe(path.resolve('/workspace/ee'));
        expect(plan.filePath).toBe(path.resolve('/workspace/ee/execution-environment.yml'));
        expect(plan.contextDir).toBe(path.resolve('/workspace/ee/context'));
        expect(plan.args).toEqual(['build', '-f', plan.filePath, '-c', plan.contextDir]);
    });

    it('includes optional tag and custom context', () => {
        const plan = planAnsibleBuilderBuild({
            filePath: '/workspace/execution-environment.yml',
            tag: 'my-ee:latest',
            contextDir: '/tmp/build-context',
        });

        expect(plan.args).toContain('--tag');
        expect(plan.args).toContain('my-ee:latest');
        expect(plan.contextDir).toBe(path.resolve('/tmp/build-context'));
    });

    it('quotes shell-unsafe path segments', () => {
        expect(shellQuote('safe-path')).toBe('safe-path');
        expect(shellQuote('path with spaces')).toBe("'path with spaces'");
        expect(shellQuote("it's")).toBe("'it'\\''s'");
    });

    it('formats a terminal-ready shell command', () => {
        const plan = planAnsibleBuilderBuild({
            filePath: '/workspace/execution-environment.yml',
        });
        const command = formatAnsibleBuilderShellCommand(plan);

        expect(command.startsWith('ansible-builder ')).toBe(true);
        expect(command).toContain('-f');
        expect(command).toContain('-c');
    });
});
