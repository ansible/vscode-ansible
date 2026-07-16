import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryEvents } from '@ansible/common';

const mockSendEvent = vi.fn();

vi.mock('../../../src/services/TelemetryService', () => ({
    TelemetryService: {
        getInstance: vi.fn(() => ({
            sendEvent: mockSendEvent,
        })),
    },
}));

import { TelemetryService } from '../../../src/services/TelemetryService';
import {
    OnceJourneyEmitter,
    durationSecToMs,
    emitCreatorComplete,
    emitJourneyOutcome,
    emitPlaybookProgressOutcome,
    isPlaybookStatsFailed,
} from '../../../src/services/journeyTelemetry';

describe('journeyTelemetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(TelemetryService.getInstance).mockReturnValue({
            sendEvent: mockSendEvent,
        } as unknown as TelemetryService);
    });

    describe('isPlaybookStatsFailed', () => {
        it('returns false for missing or non-object stats', () => {
            expect(isPlaybookStatsFailed(undefined)).toBe(false);
            expect(isPlaybookStatsFailed(null)).toBe(false);
            expect(isPlaybookStatsFailed('ok')).toBe(false);
        });

        it('returns false when all hosts have zero failures and unreachable', () => {
            expect(
                isPlaybookStatsFailed({
                    host1: { failures: 0, unreachable: 0, ok: 2 },
                    host2: { failures: 0, unreachable: 0 },
                }),
            ).toBe(false);
        });

        it('returns true when any host has failures or unreachable', () => {
            expect(
                isPlaybookStatsFailed({
                    host1: { failures: 1, unreachable: 0 },
                }),
            ).toBe(true);
            expect(
                isPlaybookStatsFailed({
                    host1: { failures: 0, unreachable: 2 },
                }),
            ).toBe(true);
        });

        it('skips non-object host entries', () => {
            expect(
                isPlaybookStatsFailed({
                    host1: null,
                    host2: 'bad',
                    host3: { failures: 0, unreachable: 0 },
                }),
            ).toBe(false);
        });
    });

    describe('durationSecToMs', () => {
        it('converts seconds to rounded non-negative ms strings', () => {
            expect(durationSecToMs(1.4)).toBe('1400');
            expect(durationSecToMs(0)).toBe('0');
            expect(durationSecToMs(-2)).toBe('0');
        });

        it('returns undefined for non-numeric values', () => {
            expect(durationSecToMs(undefined)).toBeUndefined();
            expect(durationSecToMs('3')).toBeUndefined();
            expect(durationSecToMs(Number.NaN)).toBeUndefined();
        });
    });

    describe('emitJourneyOutcome', () => {
        it('sends buildOutcomeProperties via TelemetryService', () => {
            const startedAt = Date.now() - 500;
            emitJourneyOutcome(TelemetryEvents.ENV_CREATE, 'success', { startedAt });

            expect(mockSendEvent).toHaveBeenCalledOnce();
            expect(mockSendEvent).toHaveBeenCalledWith(
                TelemetryEvents.ENV_CREATE,
                expect.objectContaining({
                    result: 'success',
                    durationMs: expect.any(String),
                }),
            );
        });

        it('includes sanitized errorCode and extra props on error', () => {
            emitJourneyOutcome(TelemetryEvents.COLLECTION_INSTALL, 'error', {
                errorCode: 'install_failed',
                extra: { toolName: 'foo' },
            });

            expect(mockSendEvent).toHaveBeenCalledWith(TelemetryEvents.COLLECTION_INSTALL, {
                result: 'error',
                errorCode: 'install_failed',
                toolName: 'foo',
            });
        });

        it('swallows errors when TelemetryService is not initialized', () => {
            vi.mocked(TelemetryService.getInstance).mockImplementation(() => {
                throw new Error('TelemetryService not initialized — call create() first');
            });

            expect(() => {
                emitJourneyOutcome(TelemetryEvents.PLAYBOOK_RUN, 'cancel');
            }).not.toThrow();
            expect(mockSendEvent).not.toHaveBeenCalled();
        });
    });

    describe('OnceJourneyEmitter', () => {
        it('emits once and no-ops on subsequent calls', () => {
            const emitter = new OnceJourneyEmitter();
            expect(emitter.sent).toBe(false);

            emitter.send(TelemetryEvents.CREATOR_COMPLETE, 'success');
            emitter.send(TelemetryEvents.CREATOR_COMPLETE, 'error', {
                errorCode: 'should_not_emit',
            });

            expect(emitter.sent).toBe(true);
            expect(mockSendEvent).toHaveBeenCalledOnce();
            expect(mockSendEvent).toHaveBeenCalledWith(TelemetryEvents.CREATOR_COMPLETE, {
                result: 'success',
            });
        });

        it('applies property overrides after outcome props', () => {
            const emitter = new OnceJourneyEmitter();
            emitter.send(
                TelemetryEvents.PLAYBOOK_RUN_WITH_PROGRESS,
                'success',
                { startedAt: Date.now() - 1000 },
                { durationMs: '2500' },
            );

            expect(mockSendEvent.mock.calls[0]?.[1]).toMatchObject({
                result: 'success',
                durationMs: '2500',
            });
        });
    });

    describe('emitCreatorComplete', () => {
        it('emits creator.complete with command extra and once-guard', () => {
            const emitter = new OnceJourneyEmitter();
            emitCreatorComplete(emitter, 'error', {
                startedAt: Date.now() - 100,
                errorCode: 'exit_nonzero',
                command: 'init/collection',
            });
            emitCreatorComplete(emitter, 'cancel', { command: 'init/collection' });

            expect(mockSendEvent).toHaveBeenCalledOnce();
            expect(mockSendEvent).toHaveBeenCalledWith(
                TelemetryEvents.CREATOR_COMPLETE,
                expect.objectContaining({
                    result: 'error',
                    errorCode: 'exit_nonzero',
                    command: 'init/collection',
                }),
            );
        });
    });

    describe('emitPlaybookProgressOutcome', () => {
        it('prefers ansible-reported durationSec over wall-clock startedAt', () => {
            const emitter = new OnceJourneyEmitter();
            emitPlaybookProgressOutcome(emitter, 'success', {
                startedAt: Date.now() - 10_000,
                durationSec: 1.25,
            });

            expect(mockSendEvent).toHaveBeenCalledWith(
                TelemetryEvents.PLAYBOOK_RUN_WITH_PROGRESS,
                expect.objectContaining({
                    result: 'success',
                    durationMs: '1250',
                }),
            );
        });

        it('emits playbook_failed error without duration when durationSec missing', () => {
            const emitter = new OnceJourneyEmitter();
            emitPlaybookProgressOutcome(emitter, 'error', {
                startedAt: Date.now() - 200,
                errorCode: 'playbook_failed',
            });

            const props = mockSendEvent.mock.calls[0]?.[1] as Record<string, string>;
            expect(props.result).toBe('error');
            expect(props.errorCode).toBe('playbook_failed');
            expect(props.durationMs).toMatch(/^\d+$/);
        });

        it('emits cancel once', () => {
            const emitter = new OnceJourneyEmitter();
            emitPlaybookProgressOutcome(emitter, 'cancel', { startedAt: Date.now() });
            emitPlaybookProgressOutcome(emitter, 'success', { startedAt: Date.now() });

            expect(mockSendEvent).toHaveBeenCalledOnce();
            expect(mockSendEvent.mock.calls[0]?.[1]).toMatchObject({ result: 'cancel' });
        });
    });
});
