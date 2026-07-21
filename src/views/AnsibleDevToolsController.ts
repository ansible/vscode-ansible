import * as vscode from 'vscode';
import { DevToolsService } from '@ansible/developer-services';
import type { DevToolPackage } from '@ansible/developer-services';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import { log } from '@src/extension';

/** Controller for installed Ansible developer tool packages. */
export class AnsibleDevToolsController {
    private _onDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    private _service: DevToolsService;
    private _envListener: vscode.Disposable | undefined;
    private _serviceListener: vscode.Disposable | undefined;
    private _refreshDebounce: ReturnType<typeof setTimeout> | undefined;

    /**
     * Create the provider and refresh when the active Python environment changes.
     * @param pythonEnvService - Service that reports Python environment changes
     */
    constructor(pythonEnvService: PythonEnvironmentService) {
        this._service = DevToolsService.getInstance();

        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            void vscode.commands.executeCommand(
                'setContext',
                'ansibleDevToolsPackages.hasPackages',
                this._service.hasPackages(),
            );
            this._onDidChange.fire(undefined);
        });

        void this._init(pythonEnvService);
    }

    /**
     * Subscribe to environment changes and run an initial refresh once
     * the Python environment is settled.
     * @param pythonEnvService - Service used to observe environment changes
     */
    private async _init(pythonEnvService: PythonEnvironmentService) {
        try {
            await pythonEnvService.initialize();

            this._envListener = pythonEnvService.onDidChangeEnvironment(() => {
                log('AnsibleDevToolsController: environment changed, scheduling refresh');
                this._scheduleRefresh();
            });

            // initialize() has resolved, so the binDirResolver points at the
            // active venv. Refresh now to pick up already-installed tools.
            log('AnsibleDevToolsController: initialized, running initial refresh');
            this._scheduleRefresh();
        } catch (error) {
            log(
                `AnsibleDevToolsController: init failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Debounce rapid change events into a single refresh. */
    private _scheduleRefresh(): void {
        if (this._refreshDebounce) {
            clearTimeout(this._refreshDebounce);
        }
        this._refreshDebounce = setTimeout(() => {
            this._refreshDebounce = undefined;
            void this.refresh();
        }, 1000);
    }

    /** Reload developer tool packages from the active environment. */
    async refresh(): Promise<void> {
        await this._service.refresh();
    }

    /**
     * Whether any developer tool packages are currently available.
     * @returns True when at least one package is installed
     */
    hasPackages(): boolean {
        return this._service.hasPackages();
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

export type { DevToolPackage };
