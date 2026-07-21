import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
    CollectionsService,
    CreatorService,
    DevToolsService,
    ExecutionEnvService,
    GalaxyCollectionCache,
    GalaxyDocsCache,
    GitHubCollectionCache,
    SCMDocsCache,
    SidebarModel,
    SkillRegistry,
    assembleSidebarInput,
    discoverPlaybooks,
    preserveExpandedChildren,
    type SidebarSnapshot,
    type SidebarTreeNode,
} from '@ansible/developer-services';
import { log, type SidebarNodeExpand } from '@ansible/common';
import type { EnvironmentManagersController } from '@src/views/EnvironmentManagersController';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';
import type { McpToolsController } from '@src/views/McpToolsController';
import type { CollectionSourcesController } from '@src/views/CollectionSourcesController';
import { getMcpStatus } from '@src/mcp/cursorConfig';
import {
    extractSelectEnvironmentId,
    isPlaybookCommand,
    normalizePlaybookPayload,
} from '@src/sidebar/navTreeCommandArgs';
import { buildSidebarNavTreeHtml } from '@src/sidebar/navTreeHtml';
import { MCP_CATEGORY_LABELS, mcpIdeDisplayName } from '@src/sidebar/mcpLabels';

/**
 * WebviewView host for the accordion sidebar NavTree (ADR-025).
 * Sole Activity Bar UI — snapshot hydrate, command dispatch, lazy expand.
 */
export class AnsibleNavTreeProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ansibleNavTree';

    private _view?: vscode.WebviewView;
    private readonly _model = new SidebarModel();
    private _disposables: vscode.Disposable[] = [];
    private _mcpTools?: McpToolsController;
    private _collectionSources?: CollectionSourcesController;
    /** Bumps on each progressive push so a stale hydrate cannot overwrite a newer one. */
    private _snapshotGeneration = 0;
    /** After the first full hydrate, skip skeleton flashes on incremental refreshes. */
    private _hasHydrated = false;
    /** Last posted snapshot (for lazy-expand patches). */
    private _lastSnapshot?: SidebarSnapshot;

    /**
     * @param _context - Extension context (MCP status, webview resources)
     * @param _envManagers - Native env managers controller (snapshot source)
     * @param _pythonEnvService - Python availability / capability
     */
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _envManagers: EnvironmentManagersController,
        private readonly _pythonEnvService: PythonEnvironmentService,
    ) {}

    /**
     * Extension install URI (webview resource root).
     * @returns Extension root URI from the activation context
     */
    private get _extensionUri(): vscode.Uri {
        return this._context.extensionUri;
    }

    /**
     * Attach MCP tools controller after it is constructed in activate().
     * @param controller - Native AI Tools controller
     */
    setMcpToolsController(controller: McpToolsController): void {
        this._mcpTools = controller;
        this._disposables.push(
            controller.onDidChange(() => {
                void this._pushSnapshot();
            }),
        );
        void this._pushSnapshot();
    }

    /**
     * Attach Collection Sources controller (Galaxy filter state + refresh events).
     * @param controller - Native collection sources controller
     */
    setCollectionSourcesController(controller: CollectionSourcesController): void {
        this._collectionSources = controller;
        this._disposables.push(
            controller.onDidChange(() => {
                void this._pushSnapshot();
            }),
        );
        void this._pushSnapshot();
    }

    /**
     * Called when the NavTree webview becomes visible.
     * @param webviewView - VS Code webview view instance
     */
    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons'),
            ],
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        this._disposables.push(
            webviewView.webview.onDidReceiveMessage(
                (msg: { method?: string; params?: unknown }) => {
                    void this._handleMessage(msg);
                },
            ),
        );

        this._disposables.push(
            this._envManagers.onDidChange(() => {
                void this._pushSnapshot();
            }),
        );

        const devTools = DevToolsService.getInstance();
        const collections = CollectionsService.getInstance();
        const creator = CreatorService.getInstance();
        const ees = ExecutionEnvService.getInstance();
        this._disposables.push(
            (devTools.onDidChange as vscode.Event<void>)(() => {
                void this._pushSnapshot();
            }),
            (collections.onDidChange as vscode.Event<void>)(() => {
                void this._pushSnapshot();
            }),
            (creator.onDidChange as vscode.Event<void>)(() => {
                void this._pushSnapshot();
            }),
            (ees.onDidChange as vscode.Event<void>)(() => {
                void this._pushSnapshot();
            }),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (
                    e.affectsConfiguration('ansibleEnvironments.enableAiFeatures') ||
                    e.affectsConfiguration('ansible.lightspeed.enabled') ||
                    e.affectsConfiguration('ansibleEnvironments.skillSources')
                ) {
                    void this._pushSnapshot();
                }
            }),
            vscode.authentication.onDidChangeSessions((e) => {
                if (e.provider.id === 'auth-lightspeed') {
                    void this._pushSnapshot();
                }
            }),
        );

        webviewView.onDidDispose(() => {
            for (const d of this._disposables) {
                d.dispose();
            }
            this._disposables = [];
            this._view = undefined;
            this._hasHydrated = false;
            this._lastSnapshot = undefined;
        });

        void this._pushSnapshot({ progressive: true });
    }

    /**
     * Handle ready / action / expand messages from the React shell.
     * @param msg - postMessage payload from the webview
     * @param msg.method - Message method name (e.g. sidebar/ready, sidebar/action)
     * @param msg.params - Optional method-specific parameters
     */
    private async _handleMessage(msg: { method?: string; params?: unknown }): Promise<void> {
        if (msg.method === 'sidebar/ready') {
            // First open: headers immediately; later ready (rare) refreshes in place.
            void this._pushSnapshot({ progressive: !this._hasHydrated });
            return;
        }
        if (msg.method === 'sidebar/expandNode') {
            const params = msg.params as
                { nodeId?: string; expand?: SidebarNodeExpand } | undefined;
            if (params?.nodeId && params.expand) {
                await this._expandNode(params.nodeId, params.expand);
            }
            return;
        }
        if (msg.method === 'sidebar/action') {
            const params = msg.params as { command?: string; args?: unknown[] } | undefined;
            const command = params?.command;
            if (!command) {
                return;
            }
            try {
                const rawArgs = params.args ?? [];
                log(`AnsibleNavTree: action ${command}`);
                if (command === 'workbench.extensions.search') {
                    const query = typeof rawArgs[0] === 'string' ? rawArgs[0] : 'ms-python.python';
                    await vscode.commands.executeCommand('workbench.extensions.search', query);
                    return;
                }
                const args = await this._enrichCommandArgs(command, rawArgs);
                if (args === null) {
                    return;
                }
                await vscode.commands.executeCommand(command, ...args);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Sidebar action failed: ${message}`);
            }
        }
    }

    /**
     * Lazy-load Galaxy/GitHub collection → plugin-type → plugin children (native parity).
     * @param nodeId - Tree node id to patch
     * @param expand - Collection identity for docs caches
     */
    private async _expandNode(nodeId: string, expand: SidebarNodeExpand): Promise<void> {
        if (!this._lastSnapshot) {
            return;
        }

        let children: SidebarTreeNode[];
        try {
            const enableAi =
                vscode.workspace
                    .getConfiguration('ansibleEnvironments')
                    .get<boolean>('enableAiFeatures') ?? true;

            if (expand.kind === 'eeDetail') {
                const details = await ExecutionEnvService.getInstance().loadDetails(
                    expand.fullName,
                );
                const systemPackages = details
                    ? await ExecutionEnvService.getInstance().getSystemPackages(expand.fullName)
                    : [];
                children = this._model.buildEeDetailNodes(
                    nodeId,
                    expand.fullName,
                    details,
                    systemPackages,
                );
            } else if (expand.kind === 'galaxyCollection') {
                const pluginTypes = await GalaxyDocsCache.getInstance().getPluginTypes(
                    expand.namespace,
                    expand.name,
                    expand.version,
                );
                children = this._model.buildPluginTypeNodes(
                    nodeId,
                    pluginTypes,
                    {
                        namespace: expand.namespace,
                        name: expand.name,
                        version: expand.version,
                    },
                    'galaxy',
                    enableAi,
                );
            } else {
                const repo = expand.repository.split('/').pop() ?? expand.repository;
                const pluginTypes = await SCMDocsCache.getInstance().getPluginTypes(
                    expand.org,
                    repo,
                    expand.namespace,
                    expand.name,
                );
                children = this._model.buildPluginTypeNodes(
                    nodeId,
                    pluginTypes,
                    {
                        namespace: expand.namespace,
                        name: expand.name,
                        version: expand.version,
                        org: expand.org,
                        repository: expand.repository,
                    },
                    'github',
                    enableAi,
                );
            }
        } catch {
            children = [
                {
                    id: `${nodeId}-error`,
                    label: 'Failed to load details',
                    icon: 'warning',
                },
            ];
        }

        const next = this._model.patchNodeChildren(this._lastSnapshot, nodeId, children);
        this._postSnapshot(next);
    }

    /**
     * Attach non-serializable fields (Uri / PythonEnvironment) expected by native commands.
     * @param command - VS Code command id
     * @param args - Args from the webview DTO
     * @returns Args for executeCommand, or null when the action was cancelled
     */
    private async _enrichCommandArgs(command: string, args: unknown[]): Promise<unknown[] | null> {
        if (command === 'ansibleDevTools.selectEnvironment') {
            const envId = extractSelectEnvironmentId(args);
            if (!envId) {
                return args;
            }
            const environments = await this._pythonEnvService.getEnvironments('all');
            const environment = environments.find((e) => e.envId.id === envId);
            if (!environment) {
                void vscode.window.showWarningMessage(
                    'Could not find that Python environment. Refresh Environment Managers and try again.',
                );
                return null;
            }
            return [environment];
        }

        if (!isPlaybookCommand(command)) {
            return args;
        }

        const wrapper = normalizePlaybookPayload(args);
        if (!wrapper) {
            return args;
        }
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(wrapper.playbook.path));
        return [
            {
                playbook: {
                    ...wrapper.playbook,
                    workspaceFolder: folder,
                },
            },
        ];
    }

    /**
     * Push NavTree state to the webview.
     * Cold start uses a skeleton (headers first); later refreshes replace content in place.
     * @param options - Optional push behaviour
     * @param options.progressive - Force skeleton-first paint (default: only before first hydrate)
     */
    private async _pushSnapshot(options?: { progressive?: boolean }): Promise<void> {
        if (!this._view) {
            return;
        }

        const generation = ++this._snapshotGeneration;
        const progressive = options?.progressive ?? !this._hasHydrated;

        if (progressive) {
            const enableAiFeatures =
                vscode.workspace
                    .getConfiguration('ansibleEnvironments')
                    .get<boolean>('enableAiFeatures') ?? true;
            const lightspeedEnabled =
                vscode.workspace.getConfiguration('ansible.lightspeed').get<boolean>('enabled') ??
                false;
            this._postSnapshot(
                this._model.buildSkeletonSnapshot({ enableAiFeatures, lightspeedEnabled }),
            );
        }

        try {
            const snapshot = await this._buildSnapshot();
            // `_view` may clear while awaiting; `_postSnapshot` no-ops when disposed.
            if (generation !== this._snapshotGeneration) {
                return;
            }
            this._hasHydrated = true;
            this._postSnapshot(preserveExpandedChildren(this._lastSnapshot, snapshot));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Ansible failed to load: ${message}`);
        }
    }

    /**
     * Post a snapshot to the webview (fire-and-forget).
     * @param snapshot - Skeleton or full NavTree state
     */
    private _postSnapshot(snapshot: SidebarSnapshot): void {
        if (!this._view) {
            return;
        }
        this._lastSnapshot = snapshot;
        void this._view.webview.postMessage({
            method: 'sidebar/setState',
            params: { snapshot },
        });
    }

    /**
     * Hydrate SidebarModel from live services / providers.
     * @returns Serialisable NavTree snapshot
     */
    private async _buildSnapshot(): Promise<SidebarSnapshot> {
        const enableAiFeatures =
            vscode.workspace
                .getConfiguration('ansibleEnvironments')
                .get<boolean>('enableAiFeatures') ?? true;
        const lightspeedEnabled =
            vscode.workspace.getConfiguration('ansible.lightspeed').get<boolean>('enabled') ??
            false;

        const pythonAvailable = this._pythonEnvService.isAvailable();
        const pythonEnvCapability = this._pythonEnvService.getCapability();
        const devTools = DevToolsService.getInstance();
        const collections = CollectionsService.getInstance();
        const creator = CreatorService.getInstance();
        const eeService = ExecutionEnvService.getInstance();
        const galaxy = GalaxyCollectionCache.getInstance();
        const github = GitHubCollectionCache.getInstance();
        const skillRegistry = SkillRegistry.getInstance();

        const playbookWorkspaces: {
            name: string;
            path: string;
            playbooks: Awaited<ReturnType<typeof discoverPlaybooks>>;
        }[] = [];
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            try {
                const found = await discoverPlaybooks(folder.uri.fsPath);
                playbookWorkspaces.push({
                    name: folder.name,
                    path: folder.uri.fsPath,
                    playbooks: found,
                });
            } catch {
                playbookWorkspaces.push({
                    name: folder.name,
                    path: folder.uri.fsPath,
                    playbooks: [],
                });
            }
        }
        let executionEnvironmentsError: string | undefined;
        const executionEnvironmentsLoading = eeService.isLoading();
        if (!executionEnvironmentsLoading) {
            try {
                await eeService.loadExecutionEnvironments();
            } catch (error) {
                executionEnvironmentsError = error instanceof Error ? error.message : String(error);
            }
        }

        const collectionsIndexing = collections.isLoading() || !collections.isLoaded();

        const githubOrgs = vscode.workspace
            .getConfiguration('ansibleEnvironments')
            .get<string[]>('githubCollectionOrgs') ?? [
            'ansible',
            'ansible-collections',
            'redhat-cop',
        ];

        const galaxyFilter = this._collectionSources?.getGalaxyFilter();
        const galaxyListed = galaxyFilter
            ? galaxy.search(galaxyFilter)
            : galaxy.getTopCollections(10);

        let mcpConfigured: boolean | undefined;
        let mcpIdeLabel: string | undefined;
        if (enableAiFeatures && this._mcpTools) {
            const status = getMcpStatus(this._context);
            mcpConfigured = status.isConfigured;
            mcpIdeLabel = mcpIdeDisplayName(status.ide);
        }

        if (enableAiFeatures) {
            await skillRegistry.ensureLoaded();
        }

        let lightspeedAuthenticated: boolean | undefined;
        if (lightspeedEnabled) {
            try {
                const session = await vscode.authentication.getSession('auth-lightspeed', [], {
                    createIfNone: false,
                });
                lightspeedAuthenticated = Boolean(session);
            } catch {
                lightspeedAuthenticated = false;
            }
        }

        const input = assembleSidebarInput({
            pythonAvailable,
            pythonEnvCapability,
            enableAiFeatures,
            envManagers: this._envManagers.getSidebarEnvManagers(),
            devTools: devTools.getPackages(),
            hasDevTools: devTools.hasPackages(),
            collections: Array.from(collections.getCollections().values()),
            collectionsIndexing,
            galaxy: {
                totalCount: galaxy.getCollections().length,
                isLoading: galaxy.isLoading(),
                filter: galaxyFilter,
                listed: galaxyListed,
            },
            githubOrgs: githubOrgs.map((org) => ({
                org,
                count: github.getCount(org),
                isRefreshing: github.isRefreshing(org),
                lastUpdated: github.getLastUpdated(org)?.toLocaleString(),
                collections: github.getCollections(org),
            })),
            executionEnvironments: eeService.getExecutionEnvironments(),
            executionEnvironmentsLoading,
            executionEnvironmentsError,
            creator: {
                status: creator.getStatus(),
                installedVersion: creator.getInstalledVersion(),
                schema: creator.getSchema(),
            },
            playbookWorkspaces,
            mcpConfigured,
            mcpIdeLabel,
            mcpCategoryLabels: MCP_CATEGORY_LABELS,
            mcpTools:
                enableAiFeatures && this._mcpTools
                    ? this._mcpTools.getAllTools().map((t) => ({
                          category: t.category,
                          tool: { name: t.tool.name, description: t.tool.description },
                          examplePrompt: t.examplePrompt,
                          toolInfo: t,
                      }))
                    : undefined,
            skillSources: enableAiFeatures ? skillRegistry.getSources() : undefined,
            skills: enableAiFeatures ? skillRegistry.getAllSkills() : undefined,
            lightspeedEnabled,
            lightspeedAuthenticated,
        });

        return this._model.buildSnapshot(input);
    }

    /**
     * HTML shell for the NavTree webview (CSP + React entry).
     * @param webview - Target webview for asWebviewUri
     * @returns Document HTML
     */
    private _getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                'node_modules',
                '@vscode',
                'codicons',
                'dist',
                'codicon.css',
            ),
        );
        return buildSidebarNavTreeHtml({
            scriptUri: scriptUri.toString(),
            codiconsUri: codiconsUri.toString(),
            nonce: crypto.randomBytes(16).toString('hex'),
            cspSource: webview.cspSource,
        });
    }
}
