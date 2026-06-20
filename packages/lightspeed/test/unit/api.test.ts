import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LightspeedAPI, type LightspeedApiConfig } from '../../src/api';
import { isError } from '../../src/errors';

function createMockConfig(overrides?: Partial<LightspeedApiConfig>): LightspeedApiConfig {
    return {
        getAccessToken: vi.fn().mockResolvedValue('test-token'),
        isAuthenticated: vi.fn().mockResolvedValue(true),
        orgOptOutTelemetry: vi.fn().mockResolvedValue(false),
        getApiEndpoint: vi.fn().mockReturnValue('https://test.example.com'),
        getExtensionVersion: vi.fn().mockReturnValue('1.0.0'),
        log: vi.fn(),
        showInfo: vi.fn(),
        showError: vi.fn(),
        ...overrides,
    };
}

function mockFetchResponse(status: number, body: unknown, ok?: boolean): Response {
    return {
        status,
        ok: ok ?? (status >= 200 && status < 300),
        json: vi.fn().mockResolvedValue(body),
        headers: new Headers(),
        statusText: '',
        type: 'basic',
        url: '',
        redirected: false,
        body: null,
        bodyUsed: false,
        clone: vi.fn(),
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
        bytes: vi.fn(),
    } as unknown as Response;
}

describe('LightspeedAPI', () => {
    let api: LightspeedAPI;
    let config: LightspeedApiConfig;

    beforeEach(() => {
        vi.restoreAllMocks();
        config = createMockConfig();
        api = new LightspeedAPI(config);
    });

    describe('completionRequest', () => {
        it('returns predictions on success', async () => {
            const mockResponse = mockFetchResponse(200, {
                predictions: ['- name: Install nginx'],
                suggestionId: 'resp-id',
                model: 'test-model',
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.completionRequest({
                prompt: '---\n- hosts: all\n  tasks:\n    - name: ',
                suggestionId: 'test-id',
                metadata: {},
            });

            expect(isError(result)).toBe(false);
            if (!isError(result)) {
                expect(result.predictions).toHaveLength(1);
                expect(result.suggestionId).toBe('resp-id');
                expect(result.model).toBe('test-model');
            }
        });

        it('returns IError on 204 (no suggestion)', async () => {
            const mockResponse = mockFetchResponse(204, null);
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.completionRequest({
                prompt: 'test',
                suggestionId: 'test-id',
                metadata: {},
            });

            expect(isError(result)).toBe(true);
            if (isError(result)) {
                expect(result.code).toBe('NO_SUGGESTION');
            }
        });

        it('returns IError on empty predictions', async () => {
            const mockResponse = mockFetchResponse(200, { predictions: [] });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.completionRequest({
                prompt: 'test',
                suggestionId: 'test-id',
                metadata: {},
            });

            expect(isError(result)).toBe(true);
            if (isError(result)) {
                expect(result.code).toBe('NO_SUGGESTION');
            }
        });

        it('returns IError on HTTP error', async () => {
            const mockResponse = mockFetchResponse(500, { detail: 'server error' }, false);
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.completionRequest({
                prompt: 'test',
                suggestionId: 'test-id',
                metadata: {},
            });

            expect(isError(result)).toBe(true);
            expect(config.showError).toHaveBeenCalled();
        });

        it('returns IError on network error', async () => {
            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failure'));

            const result = await api.completionRequest({
                prompt: 'test',
                suggestionId: 'test-id',
                metadata: {},
            });

            expect(isError(result)).toBe(true);
            expect(config.showError).toHaveBeenCalled();
        });

        it('returns IError when not authenticated', async () => {
            config = createMockConfig({
                getAccessToken: vi.fn().mockResolvedValue(undefined),
            });
            api = new LightspeedAPI(config);

            const result = await api.completionRequest({
                prompt: 'test',
                suggestionId: 'test-id',
                metadata: {},
            });

            expect(isError(result)).toBe(true);
        });
    });

    describe('feedbackRequest', () => {
        it('returns response on success', async () => {
            const mockResponse = mockFetchResponse(200, { status: 'ok' });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.feedbackRequest(
                { inlineSuggestion: { action: 0, suggestionId: 'test' } },
                true,
            );

            expect(isError(result)).toBe(false);
        });

        it('returns ERRORS_UNAUTHORIZED when not authenticated and silent', async () => {
            config = createMockConfig({
                isAuthenticated: vi.fn().mockResolvedValue(false),
            });
            api = new LightspeedAPI(config);

            const result = await api.feedbackRequest(
                { inlineSuggestion: { action: 0, suggestionId: 'test' } },
                false,
            );

            expect(isError(result)).toBe(true);
            if (isError(result)) {
                expect(result.code).toBeTruthy();
            }
        });

        it('returns IError when no event data after telemetry opt-out', async () => {
            config = createMockConfig({
                orgOptOutTelemetry: vi.fn().mockResolvedValue(true),
            });
            api = new LightspeedAPI(config);

            const result = await api.feedbackRequest(
                { inlineSuggestion: { action: 0, suggestionId: 'test' } },
                true,
            );

            expect(isError(result)).toBe(true);
            if (isError(result)) {
                expect(result.code).toBe('NO_EVENT_DATA');
            }
        });

        it('shows success message when showInfoMessage is true', async () => {
            const mockResponse = mockFetchResponse(200, { status: 'ok' });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            await api.feedbackRequest(
                { inlineSuggestion: { action: 0, suggestionId: 'test' }, model: 'test' },
                true,
                true,
            );

            expect(config.showInfo).toHaveBeenCalledWith('Thanks for your feedback!');
        });
    });

    describe('contentMatchesRequest', () => {
        it('returns matches on success', async () => {
            const mockResponse = mockFetchResponse(200, {
                contentmatches: [{ repo_name: 'test-repo' }],
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.contentMatchesRequest({
                suggestions: ['test suggestion'],
                suggestionId: 'test-id',
            });

            expect(isError(result)).toBe(false);
        });

        it('returns ERRORS_UNAUTHORIZED when not authenticated', async () => {
            config = createMockConfig({
                isAuthenticated: vi.fn().mockResolvedValue(false),
            });
            api = new LightspeedAPI(config);

            const result = await api.contentMatchesRequest({
                suggestions: ['test'],
                suggestionId: 'test-id',
            });

            expect(isError(result)).toBe(true);
        });
    });

    describe('explanationRequest', () => {
        it('returns explanation on success', async () => {
            const mockResponse = mockFetchResponse(200, {
                content: 'This playbook installs nginx',
                format: 'markdown',
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.explanationRequest({
                content: '- hosts: all',
                explanationId: 'test-id',
            });

            expect(isError(result)).toBe(false);
        });

        it('returns IError on HTTP error', async () => {
            const mockResponse = mockFetchResponse(500, {}, false);
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.explanationRequest({
                content: '- hosts: all',
                explanationId: 'test-id',
            });

            expect(isError(result)).toBe(true);
        });
    });

    describe('playbookGenerationRequest', () => {
        it('returns generated playbook on success', async () => {
            const mockResponse = mockFetchResponse(200, {
                playbook: '---\n- hosts: all',
                generationId: 'gen-id',
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.playbookGenerationRequest({
                text: 'install nginx on all servers',
                generationId: 'test-id',
            });

            expect(isError(result)).toBe(false);
        });
    });

    describe('roleGenerationRequest', () => {
        it('returns generated role on success', async () => {
            const mockResponse = mockFetchResponse(200, {
                role: 'nginx',
                files: [{ name: 'tasks/main.yml', content: '---' }],
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.roleGenerationRequest({
                text: 'create nginx role',
                generationId: 'test-id',
            });

            expect(isError(result)).toBe(false);
            if (!isError(result)) {
                expect(result.name).toBe('nginx');
            }
        });
    });

    describe('roleExplanationRequest', () => {
        it('returns explanation on success', async () => {
            const mockResponse = mockFetchResponse(200, {
                content: 'This role manages nginx',
                format: 'markdown',
            });
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

            const result = await api.roleExplanationRequest({
                content: '---',
                explanationId: 'test-id',
                files: [],
            });

            expect(isError(result)).toBe(false);
        });
    });
});
