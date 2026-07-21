import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryEvents } from '@ansible/common';

const mockSend = vi.fn(() => Promise.resolve());
const mockSendStartup = vi.fn();
const mockDispose = vi.fn();
let mockIsTelemetryEnabled = true;
let mockTelemetryConfig: { enabled: boolean | null } = { enabled: true };
type ConfigChangeHandler = (e: { affectsConfiguration: (s: string) => boolean }) => void;
let configChangeListener: ConfigChangeHandler | undefined;

vi.mock('@redhat-developer/vscode-redhat-telemetry/lib', () => ({
    getRedHatService: vi.fn(() =>
        Promise.resolve({
            getTelemetryService: vi.fn(() =>
                Promise.resolve({
                    send: mockSend,
                    sendStartupEvent: mockSendStartup,
                    sendShutdownEvent: vi.fn(),
                    flushQueue: vi.fn(),
                    dispose: mockDispose,
                }),
            ),
        }),
    ),
}));

vi.mock('vscode', () => ({
    env: {
        get isTelemetryEnabled() {
            return mockIsTelemetryEnabled;
        },
    },
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn((_key: string, _defaultValue?: unknown) => {
                if (_key === 'enabled') return mockTelemetryConfig.enabled;
                return _defaultValue;
            }),
        })),
        onDidChangeConfiguration: vi.fn((cb: typeof configChangeListener) => {
            configChangeListener = cb;
            return { dispose: vi.fn() };
        }),
    },
}));

import type * as vscode from 'vscode';
import { getRedHatService } from '@redhat-developer/vscode-redhat-telemetry/lib';
import { TelemetryService } from '../../../src/services/TelemetryService';

const mockContext = {} as vscode.ExtensionContext;

describe('TelemetryService', () => {
    let service: TelemetryService;

    /**
     * Recreate the singleton with current mock config.
     * @returns Fresh TelemetryService instance.
     */
    async function recreateService(): Promise<TelemetryService> {
        service.dispose();
        return TelemetryService.create(mockContext);
    }

    beforeEach(async () => {
        vi.clearAllMocks();
        mockIsTelemetryEnabled = true;
        mockTelemetryConfig = { enabled: true };
        configChangeListener = undefined;
        service = await TelemetryService.create(mockContext);
    });

    afterEach(() => {
        service.dispose();
    });

    describe('create', () => {
        it('returns a singleton instance', async () => {
            const instance1 = await TelemetryService.create(mockContext);
            const instance2 = await TelemetryService.create(mockContext);
            expect(instance1).toBe(instance2);
        });

        it('sends a startup event when telemetry is enabled', () => {
            expect(mockSendStartup).toHaveBeenCalled();
        });

        it('does not throw when initialization fails', async () => {
            vi.mocked(getRedHatService).mockRejectedValueOnce(new Error('init failed'));
            service.dispose();
            await expect(TelemetryService.create(mockContext)).resolves.toBeDefined();
        });

        it('clears the singleton on initialization failure so create can retry', async () => {
            vi.mocked(getRedHatService).mockRejectedValueOnce(new Error('init failed'));
            service.dispose();
            const failed = await TelemetryService.create(mockContext);

            failed.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockSend).not.toHaveBeenCalled();

            service = await TelemetryService.create(mockContext);
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockSend).toHaveBeenCalledWith({
                name: 'extension.activated',
                properties: undefined,
            });
            expect(service).not.toBe(failed);
        });
    });

    describe('isEnabled', () => {
        it('returns true when both Red Hat and VS Code telemetry are enabled', () => {
            expect(service.isEnabled).toBe(true);
        });

        it('returns false when VS Code telemetry is disabled', () => {
            mockIsTelemetryEnabled = false;
            expect(service.isEnabled).toBe(false);
        });

        it('returns false when Red Hat telemetry is disabled', async () => {
            mockTelemetryConfig = { enabled: false };
            service = await recreateService();
            expect(service.isEnabled).toBe(false);
        });

        it('returns false when Red Hat telemetry has not been opted in', async () => {
            mockTelemetryConfig = { enabled: null };
            service = await recreateService();
            expect(service.isEnabled).toBe(false);
        });
    });

    describe('sendEvent', () => {
        it('delegates to Red Hat telemetry when enabled', () => {
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockSend).toHaveBeenCalledWith({
                name: 'extension.activated',
                properties: undefined,
            });
        });

        it('passes properties to send', () => {
            service.sendEvent(TelemetryEvents.COMMAND_EXECUTED, { commandId: 'ansible.test' });
            expect(mockSend).toHaveBeenCalledWith({
                name: 'command.executed',
                properties: { commandId: 'ansible.test' },
            });
        });

        it('no-ops when Red Hat telemetry is disabled', async () => {
            mockTelemetryConfig = { enabled: false };
            service = await recreateService();
            mockSend.mockClear();
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    describe('sendError', () => {
        it('delegates to Red Hat telemetry when enabled', () => {
            const error = new Error('test error');
            service.sendError('test.error', error);
            expect(mockSend).toHaveBeenCalledWith({
                name: 'test.error',
                properties: { error: 'test error' },
            });
        });

        it('no-ops when Red Hat telemetry is disabled', async () => {
            mockTelemetryConfig = { enabled: false };
            service = await recreateService();
            mockSend.mockClear();
            service.sendError('test.error', new Error('should not send'));
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    describe('asLightspeedReporter', () => {
        it('returns a TelemetryReporter-compatible adapter', () => {
            const reporter = service.asLightspeedReporter();
            expect(typeof reporter.sendEvent).toBe('function');
        });

        it('delegates sendEvent calls to the telemetry service', () => {
            const reporter = service.asLightspeedReporter();
            reporter.sendEvent('lightspeed.suggestion.accepted', { suggestionId: 'abc' });
            expect(mockSend).toHaveBeenCalledWith({
                name: 'lightspeed.suggestion.accepted',
                properties: { suggestionId: 'abc' },
            });
        });

        it('no-ops when Red Hat telemetry is disabled', async () => {
            mockTelemetryConfig = { enabled: false };
            service = await recreateService();
            mockSend.mockClear();
            const reporter = service.asLightspeedReporter();
            reporter.sendEvent('lightspeed.suggestion.accepted');
            expect(mockSend).not.toHaveBeenCalled();
        });
    });

    describe('trackCommand', () => {
        it('wraps a handler to emit command.executed events', () => {
            const handler = vi.fn(() => 42);
            const tracked = service.trackCommand('ansible.test', handler);

            const result = tracked();

            expect(mockSend).toHaveBeenCalledWith({
                name: 'command.executed',
                properties: { commandId: 'ansible.test' },
            });
            expect(handler).toHaveBeenCalled();
            expect(result).toBe(42);
        });

        it('passes through arguments to the original handler', () => {
            const handler = vi.fn((a: string, b: number) => `${a}-${String(b)}`);
            const tracked = service.trackCommand('ansible.test', handler);

            const result = tracked('hello', 42);

            expect(result).toBe('hello-42');
            expect(handler).toHaveBeenCalledWith('hello', 42);
        });
    });

    describe('configuration change', () => {
        it('updates enabled state when config changes', () => {
            expect(service.isEnabled).toBe(true);

            mockTelemetryConfig = { enabled: false };
            configChangeListener?.({
                affectsConfiguration: (s: string) => s === 'redhat.telemetry.enabled',
            });
            expect(service.isEnabled).toBe(false);
        });

        it('ignores unrelated configuration changes', () => {
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            mockSend.mockClear();

            configChangeListener?.({
                affectsConfiguration: () => false,
            });
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockSend).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('disposes the Red Hat telemetry service', () => {
            service.dispose();
            expect(mockDispose).toHaveBeenCalled();
        });

        it('clears the singleton so create returns a new one', async () => {
            const before = await TelemetryService.create(mockContext);
            before.dispose();
            const after = await TelemetryService.create(mockContext);
            expect(after).not.toBe(before);
        });
    });
});

describe('TelemetryEvents', () => {
    it('defines all expected event categories', () => {
        expect(TelemetryEvents.EXTENSION_ACTIVATED).toBe('extension.activated');
        expect(TelemetryEvents.COMMAND_EXECUTED).toBe('command.executed');
        expect(TelemetryEvents.PLAYBOOK_RUN).toBe('playbook.run');
        expect(TelemetryEvents.CREATOR_FORM_OPEN).toBe('creator.formOpen');
        expect(TelemetryEvents.CREATOR_COMPLETE).toBe('creator.complete');
        expect(TelemetryEvents.COLLECTION_INSTALL).toBe('collection.install');
        expect(TelemetryEvents.AI_SUMMARY_REQUEST).toBe('ai.summaryRequest');
        expect(TelemetryEvents.MCP_TOOL_USE_IN_CHAT).toBe('mcp.toolUseInChat');
        expect(TelemetryEvents.SKILL_USE_IN_CHAT).toBe('skill.useInChat');
        expect(TelemetryEvents.LLM_MODEL_SELECT).toBe('llm.modelSelect');
    });

    it('all event values follow category.action naming pattern', () => {
        for (const value of Object.values(TelemetryEvents)) {
            expect(value).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
        }
    });
});
