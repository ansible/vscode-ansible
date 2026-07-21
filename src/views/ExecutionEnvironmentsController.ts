import * as vscode from 'vscode';
import { ExecutionEnvService } from '@ansible/developer-services';
import { log } from '@src/extension';

/** Controller for local execution environment images and their details. */
export class ExecutionEnvironmentsController {
    private _onDidChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

    private _service: ExecutionEnvService;
    private _serviceListener: vscode.Disposable | undefined;

    /** Create the controller and begin loading execution environments. */
    constructor() {
        this._service = ExecutionEnvService.getInstance();
        this._service.setLogFunction(log);

        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChange.fire(undefined);
        });

        // Initial load
        this.refresh();
    }

    /** Reload execution environment images and notify NavTree listeners. */
    refresh(): void {
        void this._service.refresh();
    }
}
