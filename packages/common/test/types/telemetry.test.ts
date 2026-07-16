import { describe, it, expect, vi, afterEach } from 'vitest';
import { TelemetryEvents, buildOutcomeProperties } from '../../src/types/telemetry';

describe('buildOutcomeProperties', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('includes result', () => {
        expect(buildOutcomeProperties('success')).toEqual({ result: 'success' });
        expect(buildOutcomeProperties('cancel')).toEqual({ result: 'cancel' });
        expect(buildOutcomeProperties('error')).toEqual({ result: 'error' });
    });

    it('computes durationMs from startedAt', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        expect(buildOutcomeProperties('success', { startedAt: 999_000 })).toEqual({
            result: 'success',
            durationMs: '1000',
        });
    });

    it('sanitizes errorCode and only includes it on error', () => {
        expect(buildOutcomeProperties('error', { errorCode: 'no_workspace!!' })).toEqual({
            result: 'error',
            errorCode: 'no_workspace',
        });
        expect(buildOutcomeProperties('success', { errorCode: 'ignored' })).toEqual({
            result: 'success',
        });
    });

    it('merges extra non-PII props', () => {
        expect(
            buildOutcomeProperties('success', { extra: { command: 'init/collection' } }),
        ).toEqual({
            result: 'success',
            command: 'init/collection',
        });
    });
});

describe('TelemetryEvents', () => {
    it('includes creator.complete for scaffold outcomes', () => {
        expect(TelemetryEvents.CREATOR_COMPLETE).toBe('creator.complete');
    });
});
