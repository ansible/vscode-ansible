import * as vscode from 'vscode';
import { CreatorService } from '@ansible/developer-services';
import type { SchemaNode } from '@ansible/developer-services';
import { log } from '@src/extension';

/** Controller for ansible-creator init and add commands. */
export class CreatorController {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    private _service: CreatorService;
    private _serviceListener: vscode.Disposable | undefined;

    /** Create the controller and load the ansible-creator schema. */
    constructor() {
        this._service = CreatorService.getInstance();
        this._service.setLogFunction(log);

        // Listen for service changes
        this._serviceListener = (this._service.onDidChange as vscode.Event<void>)(() => {
            this._onDidChange.fire(undefined);
        });

        // Initial load
        void this._service.loadSchema();
    }

    /** Reload the ansible-creator schema and notify NavTree listeners. */
    refresh(): void {
        void this._service.refresh();
    }

    /**
     * Expose the loaded ansible-creator schema for other extension components.
     * @returns The current creator schema, or null when unavailable
     */
    public getSchema(): SchemaNode | null {
        return this._service.getSchema();
    }

    /** Release service listeners and change event emitters. */
    dispose() {
        this._serviceListener?.dispose();
        this._onDidChange.dispose();
    }
}
