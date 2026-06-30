import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import { ValidationManager } from '../../src/services/validationManager';

/**
 * Builds a minimal LSP connection stub for ValidationManager tests.
 *
 * @returns A stub connection with diagnostics and console helpers.
 */
function mockConnection() {
    return {
        sendDiagnostics: vi.fn(),
        console: { log: vi.fn(), info: vi.fn(), error: vi.fn() },
    };
}

/**
 * Builds a stub TextDocuments manager from the given document map.
 *
 * @param docs - Map of URI to TextDocument instances.
 * @returns A stub TextDocuments object.
 */
function mockDocuments(docs = new Map<string, TextDocument>()) {
    return {
        get: vi.fn((uri: string) => docs.get(uri)),
    };
}

/**
 * Creates a test diagnostic spanning the given line range.
 *
 * @param startLine - Start line number.
 * @param endLine - End line number.
 * @param message - Diagnostic message.
 * @param severity - Diagnostic severity level.
 * @returns A Diagnostic for testing.
 */
function makeDiagnostic(
    startLine: number,
    endLine: number,
    message = 'test',
    severity = DiagnosticSeverity.Warning,
): Diagnostic {
    return {
        range: Range.create(startLine, 0, endLine, 0),
        message,
        severity,
        source: 'test',
    };
}

const fileA = 'file:///a.yml';
const fileB = 'file:///b.yml';
const fileC = 'file:///c.yml';

describe('ValidationManager', () => {
    let conn: ReturnType<typeof mockConnection>;
    let docMap: Map<string, TextDocument>;
    let docs: ReturnType<typeof mockDocuments>;
    let vm: ValidationManager;

    beforeEach(() => {
        conn = mockConnection();
        docMap = new Map([
            [fileA, TextDocument.create(fileA, 'ansible', 1, '')],
            [fileB, TextDocument.create(fileB, 'ansible', 1, '')],
        ]);
        docs = mockDocuments(docMap);
        vm = new ValidationManager(conn as never, docs as never);
    });

    describe('processDiagnostics', () => {
        it('publishes diagnostics for each file', () => {
            const diags = new Map([
                [fileA, [makeDiagnostic(0, 1)]],
                [fileB, [makeDiagnostic(2, 3)]],
            ]);
            vm.processDiagnostics(fileA, diags);
            expect(conn.sendDiagnostics).toHaveBeenCalledTimes(2);
        });

        it('skips processing when origin document is not open', () => {
            const diags = new Map([[fileA, [makeDiagnostic(0, 1)]]]);
            vm.processDiagnostics('file:///unknown.yml', diags);
            expect(conn.sendDiagnostics).not.toHaveBeenCalled();
        });

        it('clears diagnostics for unreferenced files', () => {
            const diags1 = new Map([
                [fileA, [makeDiagnostic(0, 1)]],
                [fileB, [makeDiagnostic(0, 1)]],
            ]);
            vm.processDiagnostics(fileA, diags1);

            const diags2 = new Map([[fileA, [makeDiagnostic(0, 1)]]]);
            vm.processDiagnostics(fileA, diags2);

            const calls = conn.sendDiagnostics.mock.calls;
            const clearCall = calls.find(
                (c: [{ uri: string; diagnostics: Diagnostic[] }]) =>
                    c[0].uri === fileB && c[0].diagnostics.length === 0,
            );
            expect(clearCall).toBeTruthy();
        });
    });

    describe('cacheDiagnostics + getValidationFromCache', () => {
        it('stores and retrieves cached diagnostics', () => {
            const diag = makeDiagnostic(5, 10);
            const diags = new Map([[fileA, [diag]]]);
            vm.cacheDiagnostics(fileA, diags);

            const cached = vm.getValidationFromCache(fileA);
            expect(cached).toBeDefined();
            expect(cached?.get(fileA)).toContainEqual(diag);
        });

        it('returns undefined for uncached files', () => {
            expect(vm.getValidationFromCache('file:///none.yml')).toBeUndefined();
        });

        it('returns diagnostics for referenced files from cache', () => {
            const diagA = makeDiagnostic(0, 1);
            const diagB = makeDiagnostic(2, 3);
            const diags = new Map([
                [fileA, [diagA]],
                [fileB, [diagB]],
            ]);
            vm.processDiagnostics(fileA, diags);
            vm.cacheDiagnostics(fileA, diags);

            const cached = vm.getValidationFromCache(fileA);
            expect(cached?.has(fileA)).toBe(true);
            expect(cached?.has(fileB)).toBe(true);
        });

        it('skips caching when origin document is not open', () => {
            const diags = new Map([[fileA, [makeDiagnostic(0, 1)]]]);
            vm.cacheDiagnostics('file:///unknown.yml', diags);
            expect(vm.getValidationFromCache(fileA)).toBeUndefined();
        });
    });

    describe('reconcileCacheItems', () => {
        it('removes diagnostics touching the changed range', () => {
            const diag = makeDiagnostic(5, 6);
            vm.cacheDiagnostics(fileA, new Map([[fileA, [diag]]]));

            vm.reconcileCacheItems(fileA, [{ range: Range.create(5, 0, 5, 10), text: 'new text' }]);

            const cached = vm.getValidationFromCache(fileA);
            const remaining = cached?.get(fileA) ?? [];
            expect(remaining.find((d) => d.message === diag.message)).toBeUndefined();
        });

        it('shifts diagnostics below the change by displacement', () => {
            const diag = makeDiagnostic(10, 11, 'shifted');
            vm.cacheDiagnostics(fileA, new Map([[fileA, [diag]]]));

            vm.reconcileCacheItems(fileA, [
                { range: Range.create(2, 0, 2, 0), text: 'line1\nline2\nline3' },
            ]);

            const cached = vm.getValidationFromCache(fileA);
            const items = cached?.get(fileA) ?? [];
            const shifted = items.find((d) => d.message === 'shifted');
            expect(shifted).toBeDefined();
            expect(shifted?.range.start.line).toBe(12);
        });

        it('does nothing for uncached files', () => {
            expect(() => {
                vm.reconcileCacheItems('file:///uncached.yml', [
                    { range: Range.create(0, 0, 0, 5), text: 'x' },
                ]);
            }).not.toThrow();
        });

        it('skips full-document changes (no range property)', () => {
            const diag = makeDiagnostic(5, 6, 'kept');
            vm.cacheDiagnostics(fileA, new Map([[fileA, [diag]]]));

            vm.reconcileCacheItems(fileA, [{ text: 'full replacement' }]);

            const cached = vm.getValidationFromCache(fileA);
            const items = cached?.get(fileA) ?? [];
            expect(items.find((d) => d.message === 'kept')).toBeDefined();
        });
    });

    describe('handleDocumentClosed', () => {
        it('clears diagnostics and references for closed documents', () => {
            const diags = new Map([
                [fileA, [makeDiagnostic(0, 1)]],
                [fileB, [makeDiagnostic(0, 1)]],
            ]);
            vm.processDiagnostics(fileA, diags);
            vm.cacheDiagnostics(fileA, diags);

            conn.sendDiagnostics.mockClear();
            vm.handleDocumentClosed(fileA);

            const clearCalls = conn.sendDiagnostics.mock.calls.filter(
                (c: [{ diagnostics: Diagnostic[] }]) => c[0].diagnostics.length === 0,
            );
            expect(clearCalls.length).toBeGreaterThan(0);
        });

        it('preserves diagnostics for files referenced by other origins', () => {
            docMap.set(fileC, TextDocument.create(fileC, 'ansible', 1, ''));

            const diagsA = new Map([[fileB, [makeDiagnostic(0, 1)]]]);
            vm.processDiagnostics(fileA, diagsA);

            const diagsC = new Map([[fileB, [makeDiagnostic(2, 3)]]]);
            vm.processDiagnostics(fileC, diagsC);

            conn.sendDiagnostics.mockClear();
            vm.handleDocumentClosed(fileA);

            const clearCallsForB = conn.sendDiagnostics.mock.calls.filter(
                (c: [{ uri: string; diagnostics: Diagnostic[] }]) =>
                    c[0].uri === fileB && c[0].diagnostics.length === 0,
            );
            expect(clearCallsForB).toHaveLength(0);
        });
    });
});
