/**
 * Journey telemetry helpers shared by command handlers and panels.
 * Keeps outcome emission testable without activating the full extension.
 */

import {
    TelemetryEvents,
    buildOutcomeProperties,
    type TelemetryEventName,
    type TelemetryOutcomeOptions,
    type TelemetryResult,
} from '@ansible/common';
import { TelemetryService } from '@src/services/TelemetryService';

/**
 * Whether ansible playbook_complete host stats indicate failure.
 *
 * @param stats - `event.data.stats` from the progress callback plugin
 * @returns True when any host has failures or unreachable counts
 */
export function isPlaybookStatsFailed(stats: unknown): boolean {
    if (!stats || typeof stats !== 'object') return false;
    for (const hostStats of Object.values(stats as Record<string, unknown>)) {
        if (!hostStats || typeof hostStats !== 'object') continue;
        const hs = hostStats as Record<string, unknown>;
        const failures = typeof hs.failures === 'number' ? hs.failures : 0;
        const unreachable = typeof hs.unreachable === 'number' ? hs.unreachable : 0;
        if (failures > 0 || unreachable > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Convert ansible-reported duration seconds to a durationMs property value.
 *
 * @param durationSec - Seconds from playbook_complete, if present
 * @returns String milliseconds, or undefined when not a number
 */
export function durationSecToMs(durationSec: unknown): string | undefined {
    if (typeof durationSec !== 'number' || Number.isNaN(durationSec)) {
        return undefined;
    }
    return String(Math.max(0, Math.round(durationSec * 1000)));
}

/**
 * Emit a journey outcome event (safe if TelemetryService is not initialized).
 *
 * @param name - Telemetry event name
 * @param result - success | cancel | error
 * @param options - Optional duration / errorCode / extra props
 * @returns void
 */
export function emitJourneyOutcome(
    name: TelemetryEventName,
    result: TelemetryResult,
    options?: TelemetryOutcomeOptions,
): void {
    try {
        TelemetryService.getInstance().sendEvent(name, buildOutcomeProperties(result, options));
    } catch {
        // Telemetry optional if service not initialized
    }
}

/**
 * Emit a journey event once; subsequent calls no-op.
 */
export class OnceJourneyEmitter {
    private _sent = false;

    /**
     * Whether an outcome has already been emitted.
     *
     * @returns True after the first successful send attempt
     */
    public get sent(): boolean {
        return this._sent;
    }

    /**
     * Send a journey outcome if this emitter has not already fired.
     *
     * @param name - Telemetry event name
     * @param result - success | cancel | error
     * @param options - Optional duration / errorCode / extra props
     * @param overrides - Property overrides applied after buildOutcomeProperties
     * @returns void
     */
    public send(
        name: TelemetryEventName,
        result: TelemetryResult,
        options?: TelemetryOutcomeOptions,
        overrides?: Record<string, string>,
    ): void {
        if (this._sent) return;
        this._sent = true;
        try {
            const props = {
                ...buildOutcomeProperties(result, options),
                ...overrides,
            };
            TelemetryService.getInstance().sendEvent(name, props);
        } catch {
            // Telemetry optional if service not initialized
        }
    }
}

/**
 * Emit creator.complete with outcome props.
 *
 * @param emitter - Once-guard for this panel instance
 * @param result - success | cancel | error
 * @param options - Timing / command / error metadata
 * @param options.startedAt - Epoch ms when execute began
 * @param options.errorCode - Coarse non-PII failure category
 * @param options.command - Creator command path key
 * @returns void
 */
export function emitCreatorComplete(
    emitter: OnceJourneyEmitter,
    result: TelemetryResult,
    options: { startedAt?: number; errorCode?: string; command: string },
): void {
    emitter.send(TelemetryEvents.CREATOR_COMPLETE, result, {
        startedAt: options.startedAt,
        errorCode: options.errorCode,
        extra: { command: options.command },
    });
}

/**
 * Emit playbook.runWithProgress with outcome props.
 *
 * @param emitter - Once-guard for this run
 * @param result - success | cancel | error
 * @param options - Timing / error / ansible duration
 * @param options.startedAt - Epoch ms when the user invoked the command
 * @param options.errorCode - Coarse non-PII failure category
 * @param options.durationSec - Ansible-reported duration in seconds
 * @returns void
 */
export function emitPlaybookProgressOutcome(
    emitter: OnceJourneyEmitter,
    result: TelemetryResult,
    options?: { startedAt?: number; errorCode?: string; durationSec?: unknown },
): void {
    const durationMs = durationSecToMs(options?.durationSec);
    emitter.send(
        TelemetryEvents.PLAYBOOK_RUN_WITH_PROGRESS,
        result,
        {
            startedAt: options?.startedAt,
            errorCode: options?.errorCode,
        },
        durationMs !== undefined ? { durationMs } : undefined,
    );
}
