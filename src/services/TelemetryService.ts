/**
 * Telemetry Service
 *
 * Singleton service for collecting anonymous usage telemetry.
 * Uses VS Code's native TelemetryLogger API, which automatically
 * respects the user's global telemetry consent setting
 * (`telemetry.telemetryLevel`).
 *
 * Events are only recorded when both the VS Code global setting and the
 * extension-specific `ansibleEnvironments.telemetry.enabled` opt-in are
 * true. No PII is collected.
 */

import * as vscode from 'vscode';
import { TelemetryEvents } from '@ansible/common';
import type { TelemetryEventName } from '@ansible/common';
import type { TelemetryReporter } from '@ansible/lightspeed';
import { log } from '@src/extension';

const CONFIG_SECTION = 'ansibleEnvironments.telemetry';
const CONFIG_ENABLED = 'enabled';

/**
 * Custom TelemetrySender that writes events to the extension's output channel.
 * A real backend (Segment, etc.) can replace the body of sendEventData later
 * without changing any call sites.
 */
class OutputChannelSender implements vscode.TelemetrySender {
    /**
     * @param eventName - The telemetry event name.
     * @param data - Optional event properties.
     */
    sendEventData(eventName: string, data?: Record<string, unknown>): void {
        log(`[telemetry] ${eventName} ${data ? JSON.stringify(data) : ''}`);
    }

    /**
     * @param error - The error to report.
     * @param data - Optional error properties.
     */
    sendErrorData(error: Error, data?: Record<string, unknown>): void {
        log(`[telemetry:error] ${error.message} ${data ? JSON.stringify(data) : ''}`);
    }
}

/**
 * Centralized telemetry service for the Ansible extension.
 * Wraps VS Code's TelemetryLogger API with an extension-level opt-in gate.
 */
export class TelemetryService implements vscode.Disposable {
    private static _instance: TelemetryService | undefined;

    private _logger: vscode.TelemetryLogger;
    private _extensionEnabled: boolean;
    private _disposables: vscode.Disposable[] = [];

    /** Private constructor — use getInstance(). */
    private constructor() {
        const sender = new OutputChannelSender();
        this._logger = vscode.env.createTelemetryLogger(sender, {
            ignoreBuiltInCommonProperties: false,
            ignoreUnhandledErrors: true,
        });

        this._extensionEnabled = vscode.workspace
            .getConfiguration(CONFIG_SECTION)
            .get<boolean>(CONFIG_ENABLED, false);

        this._disposables.push(
            this._logger,
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_ENABLED}`)) {
                    this._extensionEnabled = vscode.workspace
                        .getConfiguration(CONFIG_SECTION)
                        .get<boolean>(CONFIG_ENABLED, false);
                }
            }),
        );
    }

    /**
     * Get the singleton TelemetryService instance.
     * @returns The shared TelemetryService instance.
     */
    public static getInstance(): TelemetryService {
        TelemetryService._instance ??= new TelemetryService();
        return TelemetryService._instance;
    }

    /**
     * Whether telemetry is currently active (both VS Code global and
     * extension opt-in must be true).
     * @returns True when telemetry collection is enabled.
     */
    public get isEnabled(): boolean {
        return this._extensionEnabled && this._logger.isUsageEnabled;
    }

    /**
     * Record a telemetry event.
     * No-ops when either the VS Code global or extension-level setting is off.
     *
     * @param name - Event name from TelemetryEvents or a custom string.
     * @param properties - Optional string key/value pairs.
     */
    public sendEvent(name: TelemetryEventName, properties?: Record<string, string>): void {
        if (!this._extensionEnabled) return;
        this._logger.logUsage(name, properties);
    }

    /**
     * Record an error telemetry event.
     * @param name - Error event name.
     * @param error - The error to report.
     */
    public sendError(name: string, error: Error): void {
        if (!this._extensionEnabled) return;
        this._logger.logError(name, error);
    }

    /**
     * Returns a TelemetryReporter adapter compatible with the Lightspeed
     * package's reporter interface.
     * @returns An adapter that delegates to this service.
     */
    public asLightspeedReporter(): TelemetryReporter {
        return {
            sendEvent: (name: string, properties?: Record<string, string>) => {
                if (!this._extensionEnabled) return;
                this._logger.logUsage(name, properties);
            },
        };
    }

    /**
     * Wraps a command handler to automatically emit a command.executed event.
     *
     * @param commandId - The VS Code command ID.
     * @param handler - The original command handler.
     * @returns A wrapped handler that records telemetry before delegating.
     */
    public trackCommand<T extends (...args: never[]) => unknown>(
        commandId: string,
        handler: T,
    ): (...args: Parameters<T>) => ReturnType<T> {
        return (...args: Parameters<T>): ReturnType<T> => {
            this.sendEvent(TelemetryEvents.COMMAND_EXECUTED, { commandId });
            return handler(...args) as ReturnType<T>;
        };
    }

    /** Dispose all subscriptions. */
    public dispose(): void {
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
        TelemetryService._instance = undefined;
    }
}
