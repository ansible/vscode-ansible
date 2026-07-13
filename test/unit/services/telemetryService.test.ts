import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryEvents } from '@ansible/common';

const mockLogUsage = vi.fn();
const mockLogError = vi.fn();
const mockDispose = vi.fn();
let mockIsUsageEnabled = true;
let mockTelemetryConfig: Record<string, unknown> = { enabled: true };

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
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
}));

vi.mock('@src/extension', () => ({
    log: vi.fn(),
}));

import { TelemetryService } from '../../../src/services/TelemetryService';

describe('TelemetryService', () => {
    let service: TelemetryService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsUsageEnabled = true;
        mockTelemetryConfig = { enabled: true };
        service = TelemetryService.getInstance();
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
    });

    describe('sendError', () => {
        it('delegates to TelemetryLogger.logError when enabled', () => {
            const error = new Error('test error');
            service.sendError('test.error', error);
            expect(mockLogError).toHaveBeenCalledWith('test.error', error);
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

    describe('dispose', () => {
        it('disposes the telemetry logger', () => {
            service.dispose();
            expect(mockDispose).toHaveBeenCalled();
        });
    });
});

describe('TelemetryEvents', () => {
    it('defines all expected event categories', () => {
        expect(TelemetryEvents.EXTENSION_ACTIVATED).toBe('extension.activated');
        expect(TelemetryEvents.COMMAND_EXECUTED).toBe('command.executed');
        expect(TelemetryEvents.PLAYBOOK_RUN).toBe('playbook.run');
        expect(TelemetryEvents.CREATOR_FORM_OPENED).toBe('creator.formOpened');
        expect(TelemetryEvents.COLLECTION_INSTALLED).toBe('collection.installed');
        expect(TelemetryEvents.AI_SUMMARY_REQUESTED).toBe('ai.summaryRequested');
        expect(TelemetryEvents.MCP_TOOL_USED_IN_CHAT).toBe('mcp.toolUsedInChat');
        expect(TelemetryEvents.SKILL_USED_IN_CHAT).toBe('skill.usedInChat');
        expect(TelemetryEvents.LLM_MODEL_SELECTED).toBe('llm.modelSelected');
    });

    it('all event values follow category.action naming pattern', () => {
        for (const value of Object.values(TelemetryEvents)) {
            expect(value).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
        }
    });
});
