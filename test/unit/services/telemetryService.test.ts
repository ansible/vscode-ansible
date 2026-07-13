import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryEvents } from '@ansible/common';

const mockLogUsage = vi.fn();
const mockLogError = vi.fn();
const mockDispose = vi.fn();
let mockIsUsageEnabled = true;
let mockTelemetryConfig: Record<string, unknown> = { enabled: true };
type ConfigChangeHandler = (e: { affectsConfiguration: (s: string) => boolean }) => void;
let configChangeListener: ConfigChangeHandler | undefined;

vi.mock('vscode', () => ({
    env: {
        createTelemetryLogger: vi.fn(() => ({
            logUsage: mockLogUsage,
            logError: mockLogError,
            get isUsageEnabled() {
                return mockIsUsageEnabled;
            },
            onDidChangeEnableStates: vi.fn(),
            dispose: mockDispose,
        })),
    },
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn((_key: string, defaultValue: unknown) => {
                if (_key === 'enabled') return mockTelemetryConfig.enabled;
                return defaultValue;
            }),
        })),
        onDidChangeConfiguration: vi.fn((cb: typeof configChangeListener) => {
            configChangeListener = cb;
            return { dispose: vi.fn() };
        }),
    },
}));

vi.mock('@src/extension', () => ({
    log: vi.fn(),
}));

import { TelemetryService } from '../../../src/services/TelemetryService';

describe('TelemetryService', () => {
    let service: TelemetryService;

    /**
     * Recreate the singleton with current mock config.
     * @returns Fresh TelemetryService instance.
     */
    function recreateService(): TelemetryService {
        service.dispose();
        service = TelemetryService.getInstance();
        return service;
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsUsageEnabled = true;
        mockTelemetryConfig = { enabled: true };
        configChangeListener = undefined;
        service = TelemetryService.getInstance();
    });

    afterEach(() => {
        service.dispose();
    });

    describe('getInstance', () => {
        it('returns a singleton instance', () => {
            const instance1 = TelemetryService.getInstance();
            const instance2 = TelemetryService.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    describe('isEnabled', () => {
        it('returns true when both VS Code and extension telemetry are enabled', () => {
            expect(service.isEnabled).toBe(true);
        });

        it('returns false when VS Code telemetry is disabled', () => {
            mockIsUsageEnabled = false;
            expect(service.isEnabled).toBe(false);
        });

        it('returns false when extension telemetry is disabled', () => {
            mockTelemetryConfig = { enabled: false };
            recreateService();
            expect(service.isEnabled).toBe(false);
        });
    });

    describe('sendEvent', () => {
        it('delegates to TelemetryLogger.logUsage when enabled', () => {
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockLogUsage).toHaveBeenCalledWith('extension.activated', undefined);
        });

        it('passes properties to logUsage', () => {
            service.sendEvent(TelemetryEvents.COMMAND_EXECUTED, { commandId: 'ansible.test' });
            expect(mockLogUsage).toHaveBeenCalledWith('command.executed', {
                commandId: 'ansible.test',
            });
        });

        it('no-ops when extension telemetry is disabled', () => {
            mockTelemetryConfig = { enabled: false };
            recreateService();
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockLogUsage).not.toHaveBeenCalled();
        });
    });

    describe('sendError', () => {
        it('delegates to TelemetryLogger.logError when enabled', () => {
            const error = new Error('test error');
            service.sendError('test.error', error);
            expect(mockLogError).toHaveBeenCalledWith('test.error', error);
        });

        it('no-ops when extension telemetry is disabled', () => {
            mockTelemetryConfig = { enabled: false };
            recreateService();
            service.sendError('test.error', new Error('should not send'));
            expect(mockLogError).not.toHaveBeenCalled();
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
            expect(mockLogUsage).toHaveBeenCalledWith('lightspeed.suggestion.accepted', {
                suggestionId: 'abc',
            });
        });

        it('no-ops when extension telemetry is disabled', () => {
            mockTelemetryConfig = { enabled: false };
            recreateService();
            const reporter = service.asLightspeedReporter();
            reporter.sendEvent('lightspeed.suggestion.accepted');
            expect(mockLogUsage).not.toHaveBeenCalled();
        });
    });

    describe('trackCommand', () => {
        it('wraps a handler to emit command.executed events', () => {
            const handler = vi.fn(() => 42);
            const tracked = service.trackCommand('ansible.test', handler);

            const result = tracked();

            expect(mockLogUsage).toHaveBeenCalledWith('command.executed', {
                commandId: 'ansible.test',
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
                affectsConfiguration: (s: string) => s === 'ansibleEnvironments.telemetry.enabled',
            });
            expect(service.isEnabled).toBe(false);
        });

        it('ignores unrelated configuration changes', () => {
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            mockLogUsage.mockClear();

            configChangeListener?.({
                affectsConfiguration: () => false,
            });
            service.sendEvent(TelemetryEvents.EXTENSION_ACTIVATED);
            expect(mockLogUsage).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('disposes the telemetry logger', () => {
            service.dispose();
            expect(mockDispose).toHaveBeenCalled();
        });

        it('clears the singleton so getInstance creates a new one', () => {
            const before = TelemetryService.getInstance();
            before.dispose();
            const after = TelemetryService.getInstance();
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
