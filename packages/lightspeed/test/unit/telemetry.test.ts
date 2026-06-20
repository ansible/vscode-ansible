import { describe, it, expect, vi } from 'vitest';
import { noopReporter, LightspeedEvents, type TelemetryReporter, type LightspeedEventName } from '../../src/telemetry';

describe('telemetry', () => {
    describe('noopReporter', () => {
        it('does not throw when sendEvent is called', () => {
            expect(() => noopReporter.sendEvent('test')).not.toThrow();
        });

        it('accepts properties without error', () => {
            expect(() => noopReporter.sendEvent('test', { key: 'value' })).not.toThrow();
        });

        it('satisfies the TelemetryReporter interface', () => {
            const reporter: TelemetryReporter = noopReporter;
            expect(typeof reporter.sendEvent).toBe('function');
        });
    });

    describe('LightspeedEvents', () => {
        it('defines all expected event names', () => {
            expect(LightspeedEvents.SUGGESTION_ACCEPTED).toBe('lightspeed.suggestion.accepted');
            expect(LightspeedEvents.SUGGESTION_REJECTED).toBe('lightspeed.suggestion.rejected');
            expect(LightspeedEvents.SUGGESTION_IGNORED).toBe('lightspeed.suggestion.ignored');
            expect(LightspeedEvents.GENERATION_OPEN).toBe('lightspeed.generation.open');
            expect(LightspeedEvents.GENERATION_CLOSE).toBe('lightspeed.generation.close');
            expect(LightspeedEvents.GENERATION_TRANSITION).toBe('lightspeed.generation.transition');
            expect(LightspeedEvents.GENERATION_ACCEPT).toBe('lightspeed.generation.accept');
            expect(LightspeedEvents.EXPLANATION_REQUESTED).toBe('lightspeed.explanation.requested');
            expect(LightspeedEvents.FEEDBACK_THUMBS_UP).toBe('lightspeed.feedback.thumbsUp');
            expect(LightspeedEvents.FEEDBACK_THUMBS_DOWN).toBe('lightspeed.feedback.thumbsDown');
            expect(LightspeedEvents.CONTENT_MATCHES_FETCHED).toBe('lightspeed.contentMatches.fetched');
        });

        it('has exactly 11 events', () => {
            expect(Object.keys(LightspeedEvents)).toHaveLength(11);
        });

        it('all values follow the lightspeed.* naming pattern', () => {
            for (const value of Object.values(LightspeedEvents)) {
                expect(value).toMatch(/^lightspeed\./);
            }
        });
    });

    describe('TelemetryReporter interface', () => {
        it('can be implemented with tracking', () => {
            const events: { name: string; properties?: Record<string, string> }[] = [];
            const reporter: TelemetryReporter = {
                sendEvent(name, properties) {
                    events.push({ name, properties });
                },
            };

            reporter.sendEvent(LightspeedEvents.SUGGESTION_ACCEPTED, { suggestionId: 'abc' });
            reporter.sendEvent(LightspeedEvents.GENERATION_ACCEPT);

            expect(events).toHaveLength(2);
            expect(events[0].name).toBe('lightspeed.suggestion.accepted');
            expect(events[0].properties).toEqual({ suggestionId: 'abc' });
            expect(events[1].properties).toBeUndefined();
        });
    });
});
