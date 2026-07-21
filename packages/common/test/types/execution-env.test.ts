import { describe, expect, it } from 'vitest';
import { shortExecutionEnvironmentName } from '../../src/types/execution-env';

describe('shortExecutionEnvironmentName', () => {
    it('keeps name:tag when there is no registry path', () => {
        expect(shortExecutionEnvironmentName('ee:latest')).toBe('ee:latest');
    });

    it('strips registry and namespace, keeping the final name:tag', () => {
        expect(
            shortExecutionEnvironmentName('ghcr.io/ansible/community-ansible-dev-tools:devel'),
        ).toBe('community-ansible-dev-tools:devel');
    });

    it('handles localhost image refs', () => {
        expect(shortExecutionEnvironmentName('localhost/ansible-mcp-server:latest')).toBe(
            'ansible-mcp-server:latest',
        );
    });

    it('trims whitespace', () => {
        expect(shortExecutionEnvironmentName('  quay.io/org/image:1  ')).toBe('image:1');
    });

    it('returns the original value for empty input', () => {
        expect(shortExecutionEnvironmentName('')).toBe('');
        expect(shortExecutionEnvironmentName('   ')).toBe('   ');
    });
});
