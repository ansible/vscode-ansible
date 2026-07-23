/**
 * ToxTestController — VS Code Test Controller for tox-ansible environments.
 *
 * Provides test discovery and execution through the Test Explorer sidebar.
 * Groups environments by category (integration, sanity, unit) and maps
 * tox exit codes to pass/fail verdicts via ToxAnsibleService.
 */

import * as vscode from 'vscode';
import { ToxAnsibleService } from '@ansible/developer-services';
import type {
    ToxEnvironment,
    ToxTestCategory,
    ToxRunResult,
    ToxAvailability,
} from '@ansible/developer-services';
import { log } from '@src/extension';

const CONTROLLER_ID = 'ansibleToxTests';
const CONTROLLER_LABEL = 'Ansible Tox';
const DISCOVER_DEBOUNCE_MS = 500;
const CATEGORY_ID_PREFIX = 'category:';

const CATEGORY_LABELS: Record<ToxTestCategory, string> = {
    integration: 'Integration',
    sanity: 'Sanity',
    unit: 'Unit',
    unknown: 'Other',
};

/** VS Code Test Controller for tox-ansible environments. */
export class ToxTestController implements vscode.Disposable {
    private readonly _controller: vscode.TestController;
    private readonly _service: ToxAnsibleService;
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _watchers: vscode.FileSystemWatcher[] = [];
    private _discovering = false;
    private _pendingRediscover = false;
    private _discoverDebounce?: ReturnType<typeof setTimeout>;
    private _discoverResolve?: () => void;

    /**
     * @param service - ToxAnsibleService instance for discovery and execution
     * @param _telemetry - Optional telemetry callback for discovery/run events
     */
    constructor(
        service?: ToxAnsibleService,
        private readonly _telemetry?: (name: string, props?: Record<string, string>) => void,
    ) {
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
     * Debounces rapid calls (e.g., from file watchers). If discovery is
     * already in progress, schedules a re-run after it completes so the
     * final file-system state is always picked up.
     */
    async discoverTests(): Promise<void> {
        if (this._discoverDebounce) {
            clearTimeout(this._discoverDebounce);
            this._discoverResolve?.();
        }

        return new Promise<void>((resolve) => {
            this._discoverResolve = resolve;
            this._discoverDebounce = setTimeout(() => {
                this._discoverResolve = undefined;
                void this._guardedDiscover().then(resolve);
            }, DISCOVER_DEBOUNCE_MS);
        });
    }

    /**
     * Guard discovery so trailing requests during an active run are
     * re-executed once the current discovery finishes.
     */
    private async _guardedDiscover(): Promise<void> {
        if (this._discovering) {
            this._pendingRediscover = true;
            return;
        }
        this._discovering = true;
        try {
            this._pendingRediscover = false;
            await this._doDiscoverTests();
            // File-watcher callbacks may set _pendingRediscover during the await above
            while (this._pendingRediscover as boolean) {
                this._pendingRediscover = false;
                await this._doDiscoverTests();
            }
        } finally {
            this._discovering = false;
        }
    }

    /**
     * Perform the actual test discovery across workspace folders.
     */
    private async _doDiscoverTests(): Promise<void> {
        const startedAt = Date.now();
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return;

        const availability = await this._service.checkAvailability();
        if (!availability.toxInstalled || !availability.toxAnsibleInstalled) {
            log('ToxTestController: tox-ansible not available');
            this._controller.items.replace([]);
            this._showEmptyState(availability);
            return;
        }

        this._controller.items.replace([]);
        let totalEnvs = 0;

        for (const folder of folders) {
            const envs = await this._service.listEnvironments(folder.uri.fsPath);
            if (envs.length === 0) continue;

            this._buildTestTree(envs, folder);
            totalEnvs += envs.length;
            log(
                `ToxTestController: loaded ${String(envs.length)} environments from ${folder.name}`,
            );
        }

        this._telemetry?.('tox.discover', {
            result: 'success',
            envCount: String(totalEnvs),
            durationMs: String(Date.now() - startedAt),
        });
    }

    /**
     * Show an informational message when tox-ansible is not available.
     * Satisfies TOX-001 empty state acceptance criterion.
     * @param availability - Tox/tox-ansible availability check result
     */
    private _showEmptyState(availability: ToxAvailability): void {
        const msg = !availability.toxInstalled
            ? 'tox is not installed. Install ansible-dev-tools to enable tox-ansible testing.'
            : 'tox-ansible plugin is not installed. Run: pip install tox-ansible';
        void vscode.window.showInformationMessage(msg);
    }

    /**
     * Build the TestItem hierarchy grouped by category.
     * Category IDs use a "category:" prefix to avoid collision with env names.
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
                const catId = `${folder.uri.toString()}/${CATEGORY_ID_PREFIX}${env.category}`;
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

    /** Watch tox config files and trigger re-discovery on changes. */
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

        const abortController = new AbortController();
        const cancelSub = token.onCancellationRequested(() => {
            abortController.abort();
        });

        try {
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

                await this._executeItem(run, item, envName, workspaceDir, abortController);
            }
        } finally {
            cancelSub.dispose();
            run.end();
        }
    }

    /**
     * Execute a single test item and report the result.
     * @param run - Active test run to report into
     * @param item - Test item being executed
     * @param envName - Tox environment name to run
     * @param workspaceDir - Workspace root path
     * @param abortController - Controller whose signal cancels the tox process
     */
    private async _executeItem(
        run: vscode.TestRun,
        item: vscode.TestItem,
        envName: string,
        workspaceDir: string,
        abortController: AbortController,
    ): Promise<void> {
        run.started(item);
        const startedAt = Date.now();

        try {
            const result = await this._service.runEnvironment(
                envName,
                workspaceDir,
                undefined,
                abortController.signal,
            );

            if (abortController.signal.aborted && !result.success) {
                run.skipped(item);
                this._telemetry?.('tox.run', { result: 'cancel', environment: envName });
                return;
            }

            this._reportResult(run, item, result);
            this._telemetry?.('tox.run', {
                result: result.success ? 'success' : 'error',
                environment: envName,
                durationMs: String(Date.now() - startedAt),
                ...(result.timedOut ? { timedOut: 'true' } : {}),
            });
        } catch (err) {
            run.errored(
                item,
                new vscode.TestMessage(err instanceof Error ? err.message : 'Unknown error'),
            );
            this._telemetry?.('tox.run', {
                result: 'error',
                environment: envName,
                errorCode: 'unexpected_exception',
            });
        }
    }

    /**
     * Report a ToxRunResult to the test run, appending output and setting verdict.
     * @param run - Active test run to report into
     * @param item - Test item the result belongs to
     * @param result - Run result from ToxAnsibleService
     */
    private _reportResult(run: vscode.TestRun, item: vscode.TestItem, result: ToxRunResult): void {
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        if (output) {
            run.appendOutput(output.replace(/\r?\n/g, '\r\n') + '\r\n', undefined, item);
        }

        if (result.success) {
            run.passed(item, result.durationMs);
        } else if (result.timedOut) {
            run.errored(
                item,
                new vscode.TestMessage(`Timed out after ${String(result.durationMs)}ms`),
                result.durationMs,
            );
        } else {
            run.failed(
                item,
                new vscode.TestMessage(output || `Exit code: ${String(result.exitCode)}`),
                result.durationMs,
            );
        }
    }

    /**
     * Collect leaf test items from a run request, respecting exclude list.
     * If specific tests are selected, expand category nodes to individual envs.
     * @param request - VS Code test run request
     * @returns Flat list of leaf test items to execute
     */
    private _collectTestItems(request: vscode.TestRunRequest): vscode.TestItem[] {
        const items: vscode.TestItem[] = [];
        const excludeSet = new Set(request.exclude ?? []);

        if (request.include) {
            for (const item of request.include) {
                if (excludeSet.has(item)) continue;
                if (item.children.size > 0) {
                    item.children.forEach((child) => {
                        if (!excludeSet.has(child)) items.push(child);
                    });
                } else {
                    items.push(item);
                }
            }
        } else {
            this._controller.items.forEach((category) => {
                if (excludeSet.has(category)) return;
                category.children.forEach((child) => {
                    if (!excludeSet.has(child)) items.push(child);
                });
            });
        }

        return items;
    }

    /**
     * Extract the tox environment name from a test item ID.
     * Category nodes use the "category:" prefix and are skipped.
     * @param item - Test item to extract from
     * @returns Environment name or undefined for category nodes
     */
    private _extractEnvName(item: vscode.TestItem): string | undefined {
        const lastPart = item.id.split('/').at(-1);
        if (!lastPart || lastPart.startsWith(CATEGORY_ID_PREFIX)) {
            return undefined;
        }
        return lastPart;
    }

    /**
     * Resolve the workspace directory for a test item.
     * Appends "/" to folder URIs to prevent prefix collisions
     * (e.g., "file:///workspace" matching "file:///workspace2").
     * @param item - Test item whose workspace to find
     * @returns Workspace directory path, or undefined
     */
    private _resolveWorkspaceDir(item: vscode.TestItem): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return undefined;

        for (const folder of folders) {
            const folderPrefix = folder.uri.toString() + '/';
            if (item.id.startsWith(folderPrefix)) {
                return folder.uri.fsPath;
            }
        }

        return undefined;
    }

    /** Release all watchers, timers, and the test controller. */
    dispose(): void {
        if (this._discoverDebounce) clearTimeout(this._discoverDebounce);
        this._discoverResolve?.();
        for (const d of this._disposables) d.dispose();
        this._controller.dispose();
    }
}
