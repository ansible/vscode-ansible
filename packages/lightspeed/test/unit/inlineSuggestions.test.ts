import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockExtensionContext } from '../helpers/mockContext';

const {
    mockRegisterInlineCompletionItemProvider,
    mockGetConfiguration,
} = vi.hoisted(() => ({
    mockRegisterInlineCompletionItemProvider: vi.fn((_selector: unknown, _provider: unknown) => {
        return { dispose: vi.fn() };
    }),
    mockGetConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((key: string, defaultValue?: unknown) => {
            if (key === 'suggestions.enabled') return true;
            return defaultValue;
        }),
    }),
}));

let capturedProvider: any;

vi.mock('vscode', () => ({
    languages: {
        registerInlineCompletionItemProvider: (...args: any[]) => {
            capturedProvider = args[1];
            return mockRegisterInlineCompletionItemProvider(...args);
        },
    },
    workspace: {
        getConfiguration: mockGetConfiguration,
    },
    window: {
        activeTextEditor: undefined as any,
    },
    Range: class MockRange {
        constructor(public start: any, public end: any) {}
        get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
    },
    Position: class MockPosition {
        constructor(public line: number, public character: number) {}
    },
    InlineCompletionItem: class MockInlineCompletionItem {
        constructor(public insertText: string) {}
    },
    InlineCompletionContext: {},
}));

import { registerInlineSuggestions } from '../../src/commands/inlineSuggestions';
import { LightspeedAPI, type LightspeedApiConfig } from '../../src/api';
import { noopReporter } from '../../src/telemetry';

function createMockApiConfig(): LightspeedApiConfig {
    return {
        getAccessToken: vi.fn().mockResolvedValue('test-token'),
        isAuthenticated: vi.fn().mockResolvedValue(true),
        orgOptOutTelemetry: vi.fn().mockResolvedValue(false),
        getApiEndpoint: vi.fn().mockReturnValue('https://test.example.com'),
        getExtensionVersion: vi.fn().mockReturnValue('1.0.0'),
        log: vi.fn(),
        showInfo: vi.fn(),
        showError: vi.fn(),
    };
}

function createMockDocument(lines: string[], languageId = 'ansible') {
    return {
        languageId,
        lineAt: (line: number) => ({
            text: lines[line] ?? '',
            isEmptyOrWhitespace: !lines[line]?.trim(),
        }),
        getText: vi.fn((range?: any) => {
            if (!range) return lines.join('\n');
            const endLine = Math.min(range.end.line, lines.length - 1);
            return lines.slice(range.start.line, endLine + 1).join('\n');
        }),
        uri: { toString: () => 'file:///test.yml' },
    };
}

describe('registerInlineSuggestions', () => {
    let context: any;
    let api: LightspeedAPI;

    beforeEach(() => {
        vi.restoreAllMocks();
        capturedProvider = undefined;
        context = createMockExtensionContext();
        api = new LightspeedAPI(createMockApiConfig());

        mockGetConfiguration.mockReturnValue({
            get: vi.fn((key: string, defaultValue?: unknown) => {
                if (key === 'suggestions.enabled') return true;
                return defaultValue;
            }),
        });
    });

    it('registers an inline completion provider for ansible and yaml', () => {
        registerInlineSuggestions(context, api, noopReporter);

        expect(mockRegisterInlineCompletionItemProvider).toHaveBeenCalledWith(
            [{ language: 'ansible' }, { language: 'yaml' }],
            expect.any(Object),
        );
    });

    it('pushes disposable onto context.subscriptions', () => {
        registerInlineSuggestions(context, api, noopReporter);

        expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    describe('provideInlineCompletionItems', () => {
        const noCancelToken = { isCancellationRequested: false, onCancellationRequested: vi.fn() };

        beforeEach(() => {
            registerInlineSuggestions(context, api, noopReporter);
        });

        it('returns undefined for non-ansible languages', async () => {
            const doc = createMockDocument(['test'], 'javascript');
            const position = { line: 1, character: 0 };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });

        it('returns undefined when suggestions are disabled', async () => {
            mockGetConfiguration.mockReturnValue({
                get: vi.fn((key: string) => {
                    if (key === 'suggestions.enabled') return false;
                    return undefined;
                }),
            });

            const doc = createMockDocument(['- name: test task', ''], 'ansible');
            const position = { line: 1, character: 0 };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });

        it('returns undefined on line 0', async () => {
            const doc = createMockDocument(['- name: test'], 'ansible');
            const position = { line: 0, character: 0 };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });

        it('returns undefined when cancelled', async () => {
            const doc = createMockDocument(['- name: test', ''], 'ansible');
            const cancelledToken = { isCancellationRequested: true, onCancellationRequested: vi.fn() };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, { line: 1, character: 0 }, {}, cancelledToken,
            );

            expect(result).toBeUndefined();
        });

        it('returns undefined when no task pattern matches', async () => {
            const doc = createMockDocument(['just some text', ''], 'ansible');
            const position = { line: 1, character: 0 };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });

        it('returns undefined when current line is not empty', async () => {
            const doc = createMockDocument(['- name: Install nginx', 'some content'], 'ansible');
            const position = { line: 1, character: 0 };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });

        it('calls API when single-task pattern matches', async () => {
            const doc = createMockDocument([
                '- name: Install nginx on all servers',
                '',
            ], 'ansible');
            const position = { line: 1, character: 0 };

            const mockResponse = {
                predictions: ['  ansible.builtin.apt:\n    name: nginx\n    state: present'],
                suggestionId: 'resp-id',
                model: 'test-model',
            };
            vi.spyOn(api, 'completionRequest').mockResolvedValue(mockResponse);

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(api.completionRequest).toHaveBeenCalled();
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('calls API when multi-task comment pattern matches', async () => {
            const doc = createMockDocument([
                '# Install and configure nginx',
                '',
            ], 'ansible');
            const position = { line: 1, character: 0 };

            vi.spyOn(api, 'completionRequest').mockResolvedValue({
                predictions: ['- name: Install nginx'],
                suggestionId: 'resp-id',
            });

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(api.completionRequest).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('returns undefined when API returns error', async () => {
            const doc = createMockDocument([
                '- name: Install nginx',
                '',
            ], 'ansible');
            const position = { line: 1, character: 0 };

            vi.spyOn(api, 'completionRequest').mockResolvedValue({
                code: 'ERRORS_UNKNOWN',
                message: 'Something went wrong',
            });

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });

        it('returns undefined when API returns empty predictions', async () => {
            const doc = createMockDocument([
                '- name: Install nginx',
                '',
            ], 'ansible');
            const position = { line: 1, character: 0 };

            vi.spyOn(api, 'completionRequest').mockResolvedValue({
                predictions: [],
                suggestionId: 'resp-id',
            });

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(!result || result.length === 0).toBe(true);
        });

        it('returns undefined when indentation mismatches', async () => {
            const doc = createMockDocument([
                '    - name: Install nginx',
                '  ',
            ], 'ansible');
            const position = { line: 1, character: 2 };

            const result = await capturedProvider.provideInlineCompletionItems(
                doc, position, {}, noCancelToken,
            );

            expect(result).toBeUndefined();
        });
    });
});
