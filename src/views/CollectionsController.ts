import * as vscode from 'vscode';
import { CollectionsService } from '@ansible/developer-services';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { log } from '@src/extension';

/** Controller for installed Ansible collections and their plugins. */
export class CollectionsController {
    private _onDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    private _service: CollectionsService;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;
    private _refreshDebounce: ReturnType<typeof setTimeout> | undefined;

    /**
     * Create the provider and refresh when collections or the environment change.
     * @param pythonEnvService - Service that reports Python environment changes
     */
    constructor(pythonEnvService: PythonEnvironmentService) {
        this._service = CollectionsService.getInstance();

        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChange.fire(undefined);
        });

        log('CollectionsController: Triggering initial refresh');
        void this.refresh().catch((err: unknown) => {
            log(
                `CollectionsController: Initial refresh failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        });

        void this._initEnvListener(pythonEnvService);
    }

    /**
     * Debounce collection refreshes when the active Python environment changes.
     * @param pythonEnvService - Service used to observe environment changes
     */
    private async _initEnvListener(pythonEnvService: PythonEnvironmentService) {
        try {
            await pythonEnvService.initialize();

            this._envListener = pythonEnvService.onDidChangeEnvironment(() => {
                if (this._refreshDebounce) {
                    clearTimeout(this._refreshDebounce);
                }
                this._refreshDebounce = setTimeout(() => {
                    this._refreshDebounce = undefined;
                    void this.forceRefresh();
                }, 1000);
            });
        } catch (error) {
            log(
                `CollectionsController: Failed to set up env change listener: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Reload installed collections and plugin metadata (may use cache). */
    async refresh(): Promise<void> {
        await this._service.refresh();
    }

    /**
     * Bypass cache and re-index from ansible-doc / ade in the active env.
     * Use after env switch or ansible-dev-tools install.
     */
    async forceRefresh(): Promise<void> {
        await this._service.forceRefresh();
    }

    /** Release listeners and pending refresh timers. */
    dispose() {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._envListener?.dispose();
        this._serviceListener?.dispose();
        this._onDidChange.dispose();
    }
}
