import * as vscode from 'vscode';
import { PlaybooksService } from '@src/services/PlaybooksService';
import { log } from '@src/extension';

/** Controller for workspace playbooks and their plays. */
export class PlaybooksController {
    private _service: PlaybooksService;
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    /** Create the controller and trigger an initial playbook discovery pass. */
    constructor() {
        this._service = PlaybooksService.getInstance();

        // Listen for service changes
        this._service.onDidChange(() => {
            this._onDidChange.fire(undefined);
        });

        // Initial load
        log('PlaybooksController: Triggering initial refresh');
        void this._service.refresh();
    }

    /** Reload playbooks from the workspace and notify NavTree listeners. */
    public refresh(): void {
        void this._service.refresh();
    }
}
