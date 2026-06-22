import { describe, it, expect } from 'vitest';
import type { TextEditor } from 'vscode';
import {
    isAnsibleEditor,
    type AnsibleEnvironmentInfo,
} from '../../../src/statusBar/statusBarUtils';

describe('isAnsibleEditor', () => {
    it('returns true for ansible language', () => {
        const editor = { document: { languageId: 'ansible' } } as unknown as TextEditor;
        expect(isAnsibleEditor(editor)).toBe(true);
    });

    it('returns false for yaml language', () => {
        const editor = { document: { languageId: 'yaml' } } as unknown as TextEditor;
        expect(isAnsibleEditor(editor)).toBe(false);
    });

    it('returns false for typescript language', () => {
        const editor = { document: { languageId: 'typescript' } } as unknown as TextEditor;
        expect(isAnsibleEditor(editor)).toBe(false);
    });

    it('returns false for undefined editor', () => {
        expect(isAnsibleEditor(undefined)).toBe(false);
    });

    it('returns false for editor without document property', () => {
        const editor = { document: undefined } as unknown as TextEditor;
        expect(isAnsibleEditor(editor)).toBe(false);
    });
});

describe('AnsibleEnvironmentInfo', () => {
    it('can be constructed with all fields', () => {
        const info: AnsibleEnvironmentInfo = {
            ansibleVersion: '2.17.0',
            pythonVersion: '3.12.5',
            ansibleLintVersion: '24.7.0',
            executionEnvironmentEnabled: false,
            pythonEnvDisplayName: 'Python 3.12 (.venv)',
            pythonEnvPath: '/home/user/.venv/bin/python',
        };
        expect(info.ansibleVersion).toBe('2.17.0');
        expect(info.pythonVersion).toBe('3.12.5');
        expect(info.ansibleLintVersion).toBe('24.7.0');
        expect(info.executionEnvironmentEnabled).toBe(false);
        expect(info.pythonEnvDisplayName).toBe('Python 3.12 (.venv)');
        expect(info.pythonEnvPath).toBe('/home/user/.venv/bin/python');
    });

    it('allows partial construction for telemetry consumers', () => {
        const partial: Partial<AnsibleEnvironmentInfo> = {
            ansibleVersion: '2.17.0',
        };
        expect(partial.ansibleVersion).toBe('2.17.0');
        expect(partial.pythonVersion).toBeUndefined();
    });
});
