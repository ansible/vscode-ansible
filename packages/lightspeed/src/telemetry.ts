export interface TelemetryReporter {
    sendEvent(name: string, properties?: Record<string, string>): void;
}

export const noopReporter: TelemetryReporter = {
    sendEvent() {},
};

export const LightspeedEvents = {
    SUGGESTION_ACCEPTED: 'lightspeed.suggestion.accepted',
    SUGGESTION_REJECTED: 'lightspeed.suggestion.rejected',
    SUGGESTION_IGNORED: 'lightspeed.suggestion.ignored',
    GENERATION_OPEN: 'lightspeed.generation.open',
    GENERATION_CLOSE: 'lightspeed.generation.close',
    GENERATION_TRANSITION: 'lightspeed.generation.transition',
    GENERATION_ACCEPT: 'lightspeed.generation.accept',
    EXPLANATION_REQUESTED: 'lightspeed.explanation.requested',
    FEEDBACK_THUMBS_UP: 'lightspeed.feedback.thumbsUp',
    FEEDBACK_THUMBS_DOWN: 'lightspeed.feedback.thumbsDown',
    CONTENT_MATCHES_FETCHED: 'lightspeed.contentMatches.fetched',
} as const;

export type LightspeedEventName = (typeof LightspeedEvents)[keyof typeof LightspeedEvents];
