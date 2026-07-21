/**
 * Telemetry Service
 *
 * Wraps @redhat-developer/vscode-redhat-telemetry for anonymous usage
 * collection. Respects the user's `redhat.telemetry.enabled` opt-in and
 * VS Code's global `telemetry.telemetryLevel` setting.
 */

import * as vscode from 'vscode';
import {
    getRedHatService,
    type TelemetryService as RedHatTelemetryService,
} from '@redhat-developer/vscode-redhat-telemetry/lib';
import { TelemetryEvents } from '@ansible/common';
import type { TelemetryEventName } from '@ansible/common';
import type { TelemetryReporter } from '@ansible/lightspeed';

const CONFIG_SECTION = 'redhat.telemetry';
const CONFIG_ENABLED = 'enabled';

/**
 * Centralized telemetry service for the Ansible extension.
 * Delegates to Red Hat's shared telemetry library after opt-in.
 */
export class TelemetryService implements vscode.Disposable {
    private static _instance: TelemetryService | undefined;

    private _service: RedHatTelemetryService | undefined;
    private readonly _ready: Promise<void>;
    private _extensionEnabled: boolean;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * Private constructor — use create().
     * @param _context - VS Code extension context for Red Hat telemetry initialization.
     */
    private constructor(private readonly _context: vscode.ExtensionContext) {
        this._extensionEnabled = this._readExtensionEnabled();
        this._ready = this._initialize();
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_ENABLED}`)) {
                    this._extensionEnabled = this._readExtensionEnabled();
                }
            }),
        );
    }

    /**
     * Initialize the singleton telemetry service.
     * @param context - VS Code extension context used to obtain the Red Hat service.
     * @returns The initialized TelemetryService instance.
     */
    public static async create(context: vscode.ExtensionContext): Promise<TelemetryService> {
        if (TelemetryService._instance) {
            await TelemetryService._instance._ready;
            return TelemetryService._instance;
        }

        const instance = new TelemetryService(context);
        TelemetryService._instance = instance;
        await instance._ready;
        return instance;
    }

    /**
     * Get the singleton instance after create() has resolved.
     * @returns The shared TelemetryService instance.
     */
    public static getInstance(): TelemetryService {
        if (!TelemetryService._instance) {
            throw new Error('TelemetryService not initialized — call create() first');
        }
        return TelemetryService._instance;
    }

    /**
     * Whether telemetry is currently active (Red Hat opt-in and VS Code global
     * telemetry must both be enabled).
     * @returns True when telemetry collection is enabled.
     */
    public get isEnabled(): boolean {
        return this._extensionEnabled && vscode.env.isTelemetryEnabled;
    }

    /**
     * Record a telemetry event.
     * No-ops when telemetry is disabled.
     *
     * @param name - Event name from TelemetryEvents or a custom string.
     * @param properties - Optional string key/value pairs.
     */
    public sendEvent(name: TelemetryEventName, properties?: Record<string, string>): void {
        this._dispatch(name, properties);
    }

    /**
     * Record an error telemetry event.
     * @param name - Error event name.
     * @param error - The error to report.
     */
    public sendError(name: string, error: Error): void {
        this._dispatch(name, { error: error.message });
    }

    /**
     * Returns a TelemetryReporter adapter compatible with the Lightspeed
     * package's reporter interface.
     * @returns An adapter that delegates to this service.
     */
    public asLightspeedReporter(): TelemetryReporter {
        return {
            sendEvent: (name: string, properties?: Record<string, string>) => {
                this._dispatch(name, properties);
            },
        };
    }

    /**
     * @param name - Event name.
     * @param properties - Optional string key/value pairs.
     */
    private _dispatch(name: string, properties?: Record<string, string>): void {
        if (!this.isEnabled || !this._service) return;
        this._service.send({ name, properties }).catch((error: unknown) => {
            console.error('[telemetry] send failed:', error);
        });
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
        this._disposables.length = 0;
        if (this._service) {
            void this._service.dispose();
            this._service = undefined;
        }
        if (TelemetryService._instance === this) {
            TelemetryService._instance = undefined;
        }
    }

    /**
     * Read whether the user has opted in to Red Hat telemetry.
     * @returns True when `redhat.telemetry.enabled` is explicitly true.
     */
    private _readExtensionEnabled(): boolean {
        return (
            vscode.workspace
                .getConfiguration(CONFIG_SECTION)
                .get<boolean | null>(CONFIG_ENABLED) === true
        );
    }

    /** Initialize the Red Hat telemetry backend and send startup when enabled. */
    private async _initialize(): Promise<void> {
        try {
            const redhatService = await getRedHatService(this._context);
            this._service = await redhatService.getTelemetryService();
            if (this.isEnabled) {
                await this._service.sendStartupEvent();
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[telemetry] Initialization failed: ${message}`);
            this.dispose();
        }
    }
}
