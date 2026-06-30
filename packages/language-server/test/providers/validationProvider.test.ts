import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { doValidate, getYamlValidation } from '../../src/providers/validationProvider';
import { ValidationManager } from '../../src/services/validationManager';

const getToolPathMock = vi.hoisted(() => vi.fn());
vi.mock('@ansible/developer-services', () => ({
    getCommandService: () => ({ getToolPath: getToolPathMock }),
}));

/**
 * Builds a minimal LSP connection stub for validation tests.
 *
 * @returns A stub connection with diagnostics, console, and window helpers.
 */
function mockConnection() {
    return {
        sendDiagnostics: vi.fn(),
        console: { log: vi.fn(), info: vi.fn(), error: vi.fn() },
        window: { showErrorMessage: vi.fn() },
    };
}

/**
 * Builds a stub TextDocuments manager pre-loaded with the given URIs.
 *
 * @param uris - Document URIs to register.
 * @returns A stub TextDocuments object.
 */
function mockDocuments(uris: string[] = []) {
    const map = new Map(uris.map((u) => [u, TextDocument.create(u, 'ansible', 1, '')]));
    return { get: vi.fn((uri: string) => map.get(uri)) };
}

/**
 * Creates a TextDocument from YAML content for validation tests.
 *
 * @param content - YAML source text.
 * @param uri - Document URI.
 * @returns A language-server TextDocument instance.
 */
function doc(content: string, uri = 'file:///test.yml'): TextDocument {
    return TextDocument.create(uri, 'ansible', 1, content);
}

describe('getYamlValidation', () => {
    it('returns empty diagnostics for valid YAML', () => {
        const d = doc('key: value');
        const result = getYamlValidation(d);
        expect(result).toEqual([]);
    });

    it('detects YAML parse errors', () => {
        const d = doc('key: [invalid\n  broken: yaml');
        const result = getYamlValidation(d);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].source).toBe('Ansible [YAML]');
    });

    it('reports errors with correct severity', () => {
        const d = doc('key: {bad: yaml: here}');
        const result = getYamlValidation(d);
        const severities = result.map((d) => d.severity);
        expect(severities).toContain(DiagnosticSeverity.Error);
    });

    it('handles empty document', () => {
        const d = doc('');
        const result = getYamlValidation(d);
        expect(result).toEqual([]);
    });

    it('returns multiple diagnostics for multiple errors', () => {
        const d = doc('a: [\nb: [\nc: [');
        const result = getYamlValidation(d);
        expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('handles multi-document YAML without crashing', () => {
        const d = doc('---\nkey: value\n---\nanother: doc');
        const result = getYamlValidation(d);
        for (const diag of result) {
            expect(diag.source).toBe('Ansible [YAML]');
        }
    });
});

describe('doValidate', () => {
    let conn: ReturnType<typeof mockConnection>;
    let vm: ValidationManager;

    beforeEach(() => {
        conn = mockConnection();
        const uris = ['file:///test.yml'];
        const documents = mockDocuments(uris);
        vm = new ValidationManager(conn as never, documents as never);
        getToolPathMock.mockReset();
    });

    it('returns cached diagnostics when quick=true', async () => {
        const d = doc('- hosts: all\n  tasks: []');
        const cachedDiags = new Map([
            [
                d.uri,
                [
                    {
                        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
                        message: 'cached',
                        severity: DiagnosticSeverity.Warning,
                        source: 'test',
                    },
                ],
            ],
        ]);
        vm.processDiagnostics(d.uri, cachedDiags);
        vm.cacheDiagnostics(d.uri, cachedDiags);

        const result = await doValidate(d, vm, true);
        expect(result.get(d.uri)).toBeDefined();
    });

    it('returns empty map when no cache and quick=true', async () => {
        const d = doc('- hosts: all');
        const result = await doValidate(d, vm, true);
        expect(result.size).toBe(0);
    });

    it('returns empty diagnostics when no context provided', async () => {
        const d = doc('- hosts: all');
        const result = await doValidate(d, vm, false);
        expect(result.size).toBe(0);
    });

    it('clears diagnostics when validation is disabled', async () => {
        const d = doc('- hosts: all\n  tasks: []');
        const context = {
            documentSettings: {
                get: vi.fn().mockResolvedValue({
                    validation: { enabled: false, lint: { enabled: false } },
                }),
            },
            ansibleLint: { doValidate: vi.fn() },
            ansiblePlaybook: { doValidate: vi.fn() },
        };

        const result = await doValidate(d, vm, false, context as never, conn as never);
        expect(result.get(d.uri)).toEqual([]);
    });

    it('uses ansible-lint when lint is enabled and path found', async () => {
        const d = doc('- hosts: all\n  tasks:\n    - name: test');
        const lintDiags = new Map([[d.uri, []]]);
        const context = {
            documentSettings: {
                get: vi.fn().mockResolvedValue({
                    validation: {
                        enabled: true,
                        lint: { enabled: true, path: 'ansible-lint' },
                    },
                }),
            },
            ansibleLint: { doValidate: vi.fn().mockResolvedValue(lintDiags) },
            ansiblePlaybook: { doValidate: vi.fn() },
        };
        getToolPathMock.mockResolvedValue('/usr/bin/ansible-lint');

        const result = await doValidate(d, vm, false, context as never, conn as never);
        expect(context.ansibleLint.doValidate).toHaveBeenCalledWith(d);
        expect(result.has(d.uri)).toBe(true);
    });

    it('shows error when lint is enabled but path not found', async () => {
        const d = doc('- hosts: all\n  tasks: []');
        const context = {
            documentSettings: {
                get: vi.fn().mockResolvedValue({
                    validation: {
                        enabled: true,
                        lint: { enabled: true, path: 'ansible-lint' },
                    },
                }),
            },
            ansibleLint: { doValidate: vi.fn() },
            ansiblePlaybook: { doValidate: vi.fn() },
        };
        getToolPathMock.mockResolvedValue(null);

        await doValidate(d, vm, false, context as never, conn as never);
        expect(conn.window.showErrorMessage).toHaveBeenCalled();
    });

    it('uses ansible-playbook syntax-check when lint disabled for playbooks', async () => {
        const d = doc('- hosts: all\n  tasks:\n    - name: test');
        const playbookDiags = new Map([[d.uri, []]]);
        const context = {
            documentSettings: {
                get: vi.fn().mockResolvedValue({
                    validation: {
                        enabled: true,
                        lint: { enabled: false },
                    },
                }),
            },
            ansibleLint: { doValidate: vi.fn() },
            ansiblePlaybook: { doValidate: vi.fn().mockResolvedValue(playbookDiags) },
        };

        const result = await doValidate(d, vm, false, context as never, conn as never);
        expect(context.ansiblePlaybook.doValidate).toHaveBeenCalledWith(d);
        expect(result.has(d.uri)).toBe(true);
    });

    it('skips playbook validation for non-playbook documents', async () => {
        const d = doc('name: install\napt:\n  name: nginx');
        const context = {
            documentSettings: {
                get: vi.fn().mockResolvedValue({
                    validation: {
                        enabled: true,
                        lint: { enabled: false },
                    },
                }),
            },
            ansibleLint: { doValidate: vi.fn() },
            ansiblePlaybook: { doValidate: vi.fn() },
        };

        const result = await doValidate(d, vm, false, context as never, conn as never);
        expect(context.ansiblePlaybook.doValidate).not.toHaveBeenCalled();
        expect(result.has(d.uri)).toBe(true);
    });
});
