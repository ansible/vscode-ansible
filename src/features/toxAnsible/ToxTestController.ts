/**
 * ToxTestController — VS Code Test Controller for tox-ansible environments.
 *
 * Provides test discovery and execution through the Test Explorer sidebar.
 * Groups environments by category (integration, sanity, unit) and maps
 * tox exit codes to pass/fail verdicts via ToxAnsibleService.
 */

import * as vscode from 'vscode';
import { ToxAnsibleService } from '@ansible/developer-services';
import type { ToxEnvironment, ToxTestCategory } from '@ansible/developer-services';
import { log } from '@src/extension';

const CONTROLLER_ID = 'ansibleToxTests';
const CONTROLLER_LABEL = 'Ansible Tox';

const CATEGORY_LABELS: Record<ToxTestCategory, string> = {
    integration: 'Integration',
    sanity: 'Sanity',
    unit: 'Unit',
    unknown: 'Other',
};

/**
 *
 */
export class ToxTestController implements vscode.Disposable {
    private readonly _controller: vscode.TestController;
    private readonly _service: ToxAnsibleService;
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _watchers: vscode.FileSystemWatcher[] = [];
    private _discovering = false;

    /**
     * @param service - ToxAnsibleService instance for discovery and execution
     */
    constructor(service?: ToxAnsibleService) {
        this._service = service ?? new ToxAnsibleService();
        this._controller = vscode.tests.createTestController(CONTROLLER_ID, CONTROLLER_LABEL);

        this._controller.refreshHandler = () => {
            void this.discoverTests();
        };

        this._controller.createRunProfile(
            'Run',
            vscode.TestRunProfileKind.Run,
            (request, token) => this._runTests(request, token),
            true,
        );

        this._setupFileWatchers();
        void this.discoverTests();
    }

    /**
     * Discover tox-ansible environments and populate the test tree.
     * Clears all existing items before rebuilding to avoid stale/duplicate entries.
     */
    async discoverTests(): Promise<void> {
        if (this._discovering) return;
        this._discovering = true;

        try {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length) return;

            this._controller.items.replace([]);

            for (const folder of folders) {
                const workspaceDir = folder.uri.fsPath;
                const availability = await this._service.checkAvailability();

                if (!availability.toxInstalled || !availability.toxAnsibleInstalled) {
                    log(`ToxTestController: tox-ansible not available in ${workspaceDir}`);
                    continue;
                }

                const envs = await this._service.listEnvironments(workspaceDir);
                if (envs.length === 0) continue;

                this._buildTestTree(envs, folder);
                log(
                    `ToxTestController: loaded ${String(envs.length)} environments from ${folder.name}`,
                );
            }
        } finally {
            this._discovering = false;
        }
    }

    /**
     * Build the TestItem hierarchy grouped by category.
     * @param envs - Discovered environments to organize
     * @param folder - Workspace folder these belong to
     */
    private _buildTestTree(envs: ToxEnvironment[], folder: vscode.WorkspaceFolder): void {
        const categories = new Map<ToxTestCategory, vscode.TestItem>();

        const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
        const prefix = multiRoot ? `${folder.name}: ` : '';

        for (const env of envs) {
            let categoryItem = categories.get(env.category);
            if (!categoryItem) {
                const catId = `${folder.uri.toString()}/${env.category}`;
                categoryItem = this._controller.createTestItem(
                    catId,
                    `${prefix}${CATEGORY_LABELS[env.category]}`,
                );
                categoryItem.canResolveChildren = false;
                categories.set(env.category, categoryItem);
                this._controller.items.add(categoryItem);
            }

            const envItem = this._controller.createTestItem(
                `${folder.uri.toString()}/${env.name}`,
                env.name,
            );
            envItem.description = env.description;
            categoryItem.children.add(envItem);
        }
    }

    /**
     *
     */
    private _setupFileWatchers(): void {
        const patterns = ['**/tox-ansible.ini', '**/tox.ini', '**/pyproject.toml'];
        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            watcher.onDidChange(() => void this.discoverTests());
            watcher.onDidCreate(() => void this.discoverTests());
            watcher.onDidDelete(() => void this.discoverTests());
            this._watchers.push(watcher);
            this._disposables.push(watcher);
        }
    }

    /**
     * Execute selected tests or all tests if no specific selection.
     * @param request - VS Code test run request with included items
     * @param token - Cancellation token for aborting the run
     */
    private async _runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
    ): Promise<void> {
        const run = this._controller.createTestRun(request);
        const items = this._collectTestItems(request);

        for (const item of items) {
            if (token.isCancellationRequested) {
                run.skipped(item);
                continue;
            }

            const envName = this._extractEnvName(item);
            if (!envName) {
                run.skipped(item);
                continue;
            }

            const workspaceDir = this._resolveWorkspaceDir(item);
            if (!workspaceDir) {
                run.errored(item, new vscode.TestMessage('No workspace folder found'));
                continue;
            }

            run.started(item);

            const result = await this._service.runEnvironment(envName, workspaceDir);

            if (result.success) {
                run.passed(item, result.durationMs);
            } else {
                const message = new vscode.TestMessage(
                    result.stderr || result.stdout || `Exit code: ${String(result.exitCode)}`,
                );
                run.failed(item, message, result.durationMs);
            }
        }

        run.end();
    }

    /**
     * Collect leaf test items from a run request.
     * If specific tests are selected, expand category nodes to individual envs.
     * @param request - VS Code test run request
     * @returns Flat list of leaf test items to execute
     */
    private _collectTestItems(request: vscode.TestRunRequest): vscode.TestItem[] {
        const items: vscode.TestItem[] = [];

        if (request.include) {
            for (const item of request.include) {
                if (item.children.size > 0) {
                    item.children.forEach((child) => items.push(child));
                } else {
                    items.push(item);
                }
            }
        } else {
            this._controller.items.forEach((category) => {
                category.children.forEach((child) => items.push(child));
            });
        }

        return items;
    }

    /**
     * Extract the tox environment name from a test item ID.
     * @param item - Test item to extract from
     * @returns Environment name or undefined for category nodes
     */
    private _extractEnvName(item: vscode.TestItem): string | undefined {
        const parts = item.id.split('/');
        const lastPart = parts[parts.length - 1];
        if (Object.keys(CATEGORY_LABELS).includes(lastPart)) {
            return undefined;
        }
        return lastPart;
    }

    /**
     * Resolve the workspace directory for a test item.
     * @param item - Test item whose workspace to find
     * @returns Workspace directory path, or undefined
     */
    private _resolveWorkspaceDir(item: vscode.TestItem): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return undefined;

        for (const folder of folders) {
            if (item.id.startsWith(folder.uri.toString())) {
                return folder.uri.fsPath;
            }
        }

        return folders[0].uri.fsPath;
    }

    /**
     *
     */
    dispose(): void {
        for (const d of this._disposables) d.dispose();
        this._controller.dispose();
    }
}
