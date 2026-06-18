import * as vscode from 'vscode';
import {
    GalaxyCollectionCache,
    GalaxyDocsCache,
    GitHubCollectionCache,
    SCMDocsCache,
    buildCollectionSourcesOverviewPrompt,
    buildGalaxySourceSummaryPrompt,
    buildGithubOrgSourceSummaryPrompt,
} from '@ansible/services';
import type { GalaxyCollection, GitHubCollection, PluginInfo } from '@ansible/services';

let extensionLog: (msg: string) => void = console.log;

/**
 * Configure the logging function used by collection source operations.
 * @param logFn - Logger invoked for collection source status messages
 */
export function setCollectionSourcesLogFunction(logFn: (msg: string) => void): void {
    extensionLog = logFn;
}

/**
 * Open the chat panel with a pre-filled prompt, falling back to clipboard.
 * @param prompt - AI prompt string to send.
 */
async function openChatWithPrompt(prompt: string): Promise<void> {
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        vscode.window.showInformationMessage('Prompt sent to chat.');
    } catch {
        await vscode.env.clipboard.writeText(prompt);
        vscode.window
            .showInformationMessage(
                'AI prompt copied to clipboard. Paste it into an agent chat session.',
                'Open Chat',
            )
            .then((selection) => {
                if (selection === 'Open Chat') {
                    vscode.commands.executeCommand('workbench.action.chat.open');
                }
            });
    }
}

// ---------------------------------------------------------------------------
// Source info (shared interface for both Galaxy and GitHub)
// ---------------------------------------------------------------------------

/** Metadata for a collection source (Galaxy or GitHub). */
export interface CollectionSourceInfo {
    type: 'galaxy' | 'github';
    id: string;
    name: string;
    count: number;
    lastUpdated?: Date;
    isRefreshing: boolean;
}

// ---------------------------------------------------------------------------
// Tree node types
// ---------------------------------------------------------------------------

type TreeNode =
    | CollectionSourceNode
    | GalaxyCollectionNode
    | GalaxyPluginTypeNode
    | GalaxyPluginNode
    | GitHubCollectionNode
    | GitHubPluginTypeNode
    | GitHubPluginNode;

/** Root-level node representing a collection source (Galaxy or GitHub org). */
class CollectionSourceNode extends vscode.TreeItem {
    public readonly nodeType = 'source' as const;

    /**
     * @param source - Source metadata.
     * @param galaxyFilter - Active filter string, if any.
     * @param galaxyFilterResultCount - Number of matching results.
     */
    constructor(
        public readonly source: CollectionSourceInfo,
        public readonly galaxyFilter?: string,
        public readonly galaxyFilterResultCount?: number,
    ) {
        const isGalaxy = source.type === 'galaxy';
        super(source.name, vscode.TreeItemCollapsibleState.Collapsed);

        this.iconPath = new vscode.ThemeIcon(isGalaxy ? 'globe' : 'github');

        if (source.isRefreshing) {
            this.description = 'Refreshing...';
        } else if (isGalaxy && galaxyFilter) {
            this.description = `filter: "${galaxyFilter}" (${String(galaxyFilterResultCount ?? 0)} results)`;
        } else {
            this.description = `${source.count.toLocaleString()} collections`;
        }

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${source.name}**\n\n`);
        tooltip.appendMarkdown(
            `**Type:** ${isGalaxy ? 'Ansible Galaxy' : 'GitHub Organization'}\n\n`,
        );
        tooltip.appendMarkdown(`**Collections:** ${source.count.toLocaleString()}\n\n`);
        if (source.lastUpdated) {
            tooltip.appendMarkdown(`**Last Updated:** ${source.lastUpdated.toLocaleString()}`);
        }
        this.tooltip = tooltip;

        if (isGalaxy) {
            this.contextValue = galaxyFilter
                ? 'collectionSourceGalaxyFiltered'
                : 'collectionSourceGalaxy';
        } else {
            this.contextValue = 'collectionSourceGitHub';
        }
    }
}

/** Tree node representing a single Galaxy collection. */
class GalaxyCollectionNode extends vscode.TreeItem {
    public readonly nodeType = 'galaxyCollection' as const;

    /** @param collection - Galaxy collection metadata. */
    constructor(public readonly collection: GalaxyCollection) {
        super(
            `${collection.namespace}.${collection.name}`,
            vscode.TreeItemCollapsibleState.Collapsed,
        );
        this.description = collection.version ? `v${collection.version}` : '';
        this.iconPath = new vscode.ThemeIcon('library');
        this.contextValue = 'galaxyCollection';

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${collection.namespace}.${collection.name}**\n\n`);
        if (collection.version) tooltip.appendMarkdown(`Version: ${collection.version}\n\n`);
        tooltip.appendMarkdown(`Downloads: ${collection.downloadCount.toLocaleString()}\n\n`);
        if (collection.deprecated) tooltip.appendMarkdown('*deprecated*\n\n');
        this.tooltip = tooltip;
    }
}

/** Tree node grouping plugins by type (module, lookup, etc.). */
class GalaxyPluginTypeNode extends vscode.TreeItem {
    public readonly nodeType = 'galaxyPluginType' as const;

    /**
     * @param pluginType - Plugin type name.
     * @param plugins - Plugins of this type.
     * @param collection - Parent collection.
     */
    constructor(
        public readonly pluginType: string,
        public readonly plugins: PluginInfo[],
        public readonly collection: GalaxyCollection,
    ) {
        super(pluginType, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `(${String(plugins.length)})`;
        this.iconPath = new vscode.ThemeIcon('symbol-folder');
        this.contextValue = 'galaxyPluginType';
    }
}

/** Leaf tree node representing a single Galaxy plugin. */
class GalaxyPluginNode extends vscode.TreeItem {
    public readonly nodeType = 'galaxyPlugin' as const;

    /**
     * @param plugin - Plugin info.
     * @param pluginType - Plugin type name.
     * @param collection - Parent collection.
     */
    constructor(
        public readonly plugin: PluginInfo,
        public readonly pluginType: string,
        public readonly collection: GalaxyCollection,
    ) {
        super(plugin.name, vscode.TreeItemCollapsibleState.None);
        this.description = plugin.shortDescription;
        this.iconPath = new vscode.ThemeIcon('symbol-method');
        this.contextValue = 'galaxyPlugin';

        this.command = {
            command: 'ansibleCollectionSources.showGalaxyPluginDoc',
            title: 'Show Plugin Documentation',
            arguments: [this],
        };
    }
}

/** Tree node representing a single GitHub collection (expandable to plugin types). */
class GitHubCollectionNode extends vscode.TreeItem {
    public readonly nodeType = 'githubCollection' as const;

    /** @param collection - GitHub collection metadata. */
    constructor(public readonly collection: GitHubCollection) {
        super(
            `${collection.namespace}.${collection.name}`,
            vscode.TreeItemCollapsibleState.Collapsed,
        );
        this.description = collection.version ? `v${collection.version}` : '';
        this.iconPath = new vscode.ThemeIcon('library');
        this.contextValue = 'githubCollection';

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${collection.namespace}.${collection.name}**\n\n`);
        if (collection.version) tooltip.appendMarkdown(`Version: ${collection.version}\n\n`);
        tooltip.appendMarkdown(`Org: ${collection.org}\n\n`);
        if (collection.description) tooltip.appendMarkdown(collection.description);
        this.tooltip = tooltip;
    }
}

/** Tree node grouping plugins by type within a GitHub collection. */
class GitHubPluginTypeNode extends vscode.TreeItem {
    public readonly nodeType = 'githubPluginType' as const;

    /**
     * @param pluginType - Plugin type name.
     * @param plugins - Plugins of this type.
     * @param collection - Parent GitHub collection.
     */
    constructor(
        public readonly pluginType: string,
        public readonly plugins: PluginInfo[],
        public readonly collection: GitHubCollection,
    ) {
        super(pluginType, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `(${String(plugins.length)})`;
        this.iconPath = new vscode.ThemeIcon('symbol-folder');
        this.contextValue = 'githubPluginType';
    }
}

/** Leaf tree node representing a single GitHub-sourced plugin. */
class GitHubPluginNode extends vscode.TreeItem {
    public readonly nodeType = 'githubPlugin' as const;

    /**
     * @param plugin - Plugin info.
     * @param pluginType - Plugin type name.
     * @param collection - Parent GitHub collection.
     */
    constructor(
        public readonly plugin: PluginInfo,
        public readonly pluginType: string,
        public readonly collection: GitHubCollection,
    ) {
        super(plugin.name, vscode.TreeItemCollapsibleState.None);
        this.description = plugin.shortDescription;
        this.iconPath = new vscode.ThemeIcon('sparkle');
        this.contextValue = 'githubPlugin';

        this.command = {
            command: 'ansibleCollectionSources.showGitHubPluginDoc',
            title: 'Show Plugin Documentation',
            arguments: [this],
        };
    }
}

/**
 * Extracts the repository name from a full GitHub repository URL or path.
 * @param repository - Repository URL or path (e.g., "org/repo-name").
 * @returns The repository name portion.
 */
function repoNameFrom(repository: string): string {
    return repository.split('/').pop() ?? repository;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** TreeDataProvider for the Collection Sources sidebar view. */
export class CollectionSourcesProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _galaxyCache: GalaxyCollectionCache;
    private _galaxyDocsCache: GalaxyDocsCache;
    private _githubCache: GitHubCollectionCache;
    private _scmDocsCache: SCMDocsCache;
    private _disposables: vscode.Disposable[] = [];
    private _galaxyFilter: string | undefined;

    /** Initializes caches, loads GitHub orgs, and starts background refresh. */
    constructor() {
        this._galaxyCache = GalaxyCollectionCache.getInstance();
        this._galaxyDocsCache = GalaxyDocsCache.getInstance();
        this._githubCache = GitHubCollectionCache.getInstance();
        this._scmDocsCache = SCMDocsCache.getInstance();
        this._githubCache.setLogFunction(extensionLog);

        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('ansibleEnvironments.githubCollectionOrgs')) {
                    this._initializeGitHubOrgs();
                    this.refresh();
                }
            }),
        );

        this._initialize();
    }

    /** Kicks off initial data loading. */
    private _initialize(): void {
        extensionLog('CollectionSourcesProvider: Initializing...');
        this._initializeGitHubOrgs();
        this.refresh();
    }

    /** Loads GitHub org collections from on-disk cache. */
    private _initializeGitHubOrgs(): void {
        const orgs = this._getConfiguredOrgs();
        extensionLog(`CollectionSourcesProvider: Initializing GitHub orgs: ${orgs.join(', ')}`);
        for (const org of orgs) {
            this._githubCache.loadFromDisk(org);
        }
    }

    /**
     * Returns the configured GitHub org list from workspace settings.
     * @returns Array of GitHub organization names.
     */
    private _getConfiguredOrgs(): string[] {
        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        return (
            config.get<string[]>('githubCollectionOrgs') ?? [
                'ansible',
                'ansible-collections',
                'redhat-cop',
            ]
        );
    }

    /** Fires a tree-data-changed event to refresh the UI. */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Forces a full refresh of all Galaxy and GitHub sources.
     * @returns Resolves when all sources have been refreshed.
     */
    public async refreshAll(): Promise<void> {
        extensionLog('CollectionSourcesProvider: Refreshing all sources...');
        this.refresh();
        await this._galaxyCache.forceRefresh();
        const orgs = this._getConfiguredOrgs();
        await this._githubCache.refreshAll(orgs);
        this.refresh();
        vscode.window.showInformationMessage('All collection sources refreshed');
    }

    /**
     * Refreshes a single collection source.
     * @param source - The source to refresh.
     */
    public async refreshSource(source: CollectionSourceInfo): Promise<void> {
        extensionLog(`CollectionSourcesProvider: Refreshing source: ${source.id}`);
        this.refresh();
        if (source.type === 'galaxy') {
            await this._galaxyCache.forceRefresh();
        } else {
            await this._githubCache.refresh(source.id);
        }
        this.refresh();
        vscode.window.showInformationMessage(`${source.name} refreshed`);
    }

    /** Prompts for a GitHub org name and adds it as a collection source. */
    public async addSource(): Promise<void> {
        const orgName = await vscode.window.showInputBox({
            prompt: 'Enter GitHub organization name',
            placeHolder: 'e.g., my-org',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) return 'Organization name is required';
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Invalid organization name';
                return undefined;
            },
        });

        if (!orgName) return;

        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const orgs = config.get<string[]>('githubCollectionOrgs') ?? [];

        if (orgs.includes(orgName)) {
            vscode.window.showWarningMessage(`${orgName} is already configured`);
            return;
        }

        orgs.push(orgName);
        await config.update('githubCollectionOrgs', orgs, vscode.ConfigurationTarget.Workspace);
        await this._githubCache.refresh(orgName);
        this.refresh();
        vscode.window.showInformationMessage(`Added GitHub organization: ${orgName}`);
    }

    // -------------------------------------------------------------------
    // Tree data
    // -------------------------------------------------------------------

    /**
     * Returns the TreeItem representation of a node.
     * @param element - The tree node to represent.
     * @returns The VS Code TreeItem.
     */
    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    /**
     * Returns children for a tree node, or root nodes if no parent.
     * @param element - Parent node, or undefined for root.
     * @returns Array of child nodes.
     */
    getChildren(element?: TreeNode): TreeNode[] | Promise<TreeNode[]> {
        if (!element) {
            return Promise.resolve(this._getRootNodes());
        }

        if (element instanceof CollectionSourceNode) {
            if (element.source.type === 'galaxy') {
                return Promise.resolve(this._getGalaxyChildren());
            }
            return Promise.resolve(this._getGitHubChildren(element.source.id));
        }

        if (element instanceof GalaxyCollectionNode) {
            return this._getCollectionChildren(element.collection);
        }

        if (element instanceof GalaxyPluginTypeNode) {
            return Promise.resolve(
                element.plugins.map(
                    (p) => new GalaxyPluginNode(p, element.pluginType, element.collection),
                ),
            );
        }

        if (element instanceof GitHubCollectionNode) {
            return this._getGitHubCollectionChildren(element.collection);
        }

        if (element instanceof GitHubPluginTypeNode) {
            return Promise.resolve(
                element.plugins.map(
                    (p) => new GitHubPluginNode(p, element.pluginType, element.collection),
                ),
            );
        }

        return Promise.resolve([]);
    }

    /**
     * Builds the root-level source nodes (Galaxy + GitHub orgs).
     * @returns Array of root-level tree nodes.
     */
    private _getRootNodes(): TreeNode[] {
        const sources: TreeNode[] = [];

        const galaxyCount = this._galaxyCache.getCollections().length;
        const filterResults = this._galaxyFilter
            ? this._galaxyCache.search(this._galaxyFilter)
            : undefined;
        sources.push(
            new CollectionSourceNode(
                {
                    type: 'galaxy',
                    id: 'galaxy',
                    name: 'Ansible Galaxy',
                    count: galaxyCount,
                    lastUpdated: undefined,
                    isRefreshing: this._galaxyCache.isLoading(),
                },
                this._galaxyFilter,
                filterResults?.length,
            ),
        );

        const orgs = this._getConfiguredOrgs();
        for (const org of orgs) {
            sources.push(
                new CollectionSourceNode({
                    type: 'github',
                    id: org,
                    name: org,
                    count: this._githubCache.getCount(org),
                    lastUpdated: this._githubCache.getLastUpdated(org),
                    isRefreshing: this._githubCache.isRefreshing(org),
                }),
            );
        }

        return sources;
    }

    /**
     * Returns Galaxy collection nodes, filtered or top-10.
     * @returns Array of Galaxy collection tree nodes.
     */
    private _getGalaxyChildren(): TreeNode[] {
        const collections = this._galaxyFilter
            ? this._galaxyCache.search(this._galaxyFilter)
            : this._galaxyCache.getTopCollections(10);
        return collections.map((c) => new GalaxyCollectionNode(c));
    }

    /**
     * Expands a Galaxy collection into plugin-type groupings.
     * @param collection - The collection to expand.
     * @returns Array of plugin-type tree nodes, or an error placeholder on failure.
     */
    private async _getCollectionChildren(collection: GalaxyCollection): Promise<TreeNode[]> {
        const pluginTypes = await this._galaxyDocsCache.getPluginTypes(
            collection.namespace,
            collection.name,
            collection.version,
        );

        if (!pluginTypes) {
            const errorNode = new vscode.TreeItem(
                'Failed to load plugin documentation',
                vscode.TreeItemCollapsibleState.None,
            );
            errorNode.iconPath = new vscode.ThemeIcon('warning');
            errorNode.tooltip = `Could not fetch docs-blob for ${collection.namespace}.${collection.name} v${collection.version}. Click the collection to retry.`;
            return [errorNode as TreeNode];
        }

        return Object.entries(pluginTypes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([type, plugins]) => new GalaxyPluginTypeNode(type, plugins, collection));
    }

    /**
     * Returns GitHub collection nodes for an org.
     * @param org - GitHub organization name.
     * @returns Array of GitHub collection tree nodes.
     */
    private _getGitHubChildren(org: string): TreeNode[] {
        return this._githubCache
            .getCollections(org)
            .slice()
            .sort((a, b) => `${a.namespace}.${a.name}`.localeCompare(`${b.namespace}.${b.name}`))
            .map((c) => new GitHubCollectionNode(c));
    }

    /**
     * Expands a GitHub collection into plugin-type groupings via SCMDocsCache.
     * @param collection - The GitHub collection to expand.
     * @returns Array of plugin-type tree nodes, or an error placeholder on failure.
     */
    private async _getGitHubCollectionChildren(collection: GitHubCollection): Promise<TreeNode[]> {
        const pluginTypes = await this._scmDocsCache.getPluginTypes(
            collection.org,
            repoNameFrom(collection.repository),
            collection.namespace,
            collection.name,
        );

        if (!pluginTypes) {
            const errorNode = new vscode.TreeItem(
                'Failed to load plugin documentation',
                vscode.TreeItemCollapsibleState.None,
            );
            errorNode.iconPath = new vscode.ThemeIcon('warning');
            errorNode.tooltip =
                `Could not index ${collection.namespace}.${collection.name}. ` +
                'Requires git and ansible-doc on PATH. Click to retry.';
            return [errorNode as TreeNode];
        }

        return Object.entries(pluginTypes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([type, plugins]) => new GitHubPluginTypeNode(type, plugins, collection));
    }

    // -------------------------------------------------------------------
    // Galaxy filter
    // -------------------------------------------------------------------

    /** Prompts for a filter string and applies it to the Galaxy subtree. */
    public async filterGalaxyCollections(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Filter Galaxy collections by name',
            placeHolder: 'e.g., network, kubernetes, azure',
            value: this._galaxyFilter ?? '',
        });

        if (query === undefined) return; // cancelled

        this._galaxyFilter = query || undefined; // empty string clears
        this.refresh();
    }

    /** Clears the active Galaxy filter and refreshes. */
    public clearGalaxyFilter(): void {
        this._galaxyFilter = undefined;
        this.refresh();
    }

    // -------------------------------------------------------------------
    // Install
    // -------------------------------------------------------------------

    /**
     * Installs a Galaxy collection from a tree node click.
     * @param node - The Galaxy collection tree node.
     */
    public async installGalaxyCollection(node: GalaxyCollectionNode): Promise<void> {
        const fqcn = `${node.collection.namespace}.${node.collection.name}`;
        await this._installCollection(fqcn, 'galaxy');
    }

    /** Shows a QuickPick of all available collections for installation. */
    public async installCollection(): Promise<void> {
        interface InstallItem extends vscode.QuickPickItem {
            installUrl: string;
            sourceType: 'galaxy' | 'github';
        }

        const items: InstallItem[] = [];

        for (const c of this._galaxyCache.getCollections().slice(0, 100)) {
            items.push({
                label: `$(globe) ${c.namespace}.${c.name}`,
                description: c.version || '',
                detail: c.deprecated
                    ? '(deprecated)'
                    : `${c.downloadCount.toLocaleString()} downloads`,
                installUrl: `${c.namespace}.${c.name}`,
                sourceType: 'galaxy',
            });
        }

        const orgs = this._getConfiguredOrgs();
        for (const org of orgs) {
            for (const c of this._githubCache.getCollections(org)) {
                items.push({
                    label: `$(github) ${c.namespace}.${c.name}`,
                    description: `${c.version} • ${c.org}`,
                    detail: c.description,
                    installUrl: c.installUrl,
                    sourceType: 'github',
                });
            }
        }

        items.sort((a, b) => a.label.localeCompare(b.label));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Search and select a collection to install',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selected) {
            await this._installCollection(selected.installUrl, selected.sourceType);
        }
    }

    /**
     * Shows a QuickPick scoped to a single source for installation.
     * @param source - The collection source to browse.
     */
    public async installFromSource(source: CollectionSourceInfo): Promise<void> {
        interface InstallItem extends vscode.QuickPickItem {
            installUrl: string;
            sourceType: 'galaxy' | 'github';
        }

        const items: InstallItem[] = [];

        if (source.type === 'galaxy') {
            for (const c of this._galaxyCache.getCollections()) {
                items.push({
                    label: `${c.namespace}.${c.name}`,
                    description: c.version || '',
                    detail: c.deprecated
                        ? '(deprecated)'
                        : `${c.downloadCount.toLocaleString()} downloads`,
                    installUrl: `${c.namespace}.${c.name}`,
                    sourceType: 'galaxy',
                });
            }
        } else {
            for (const c of this._githubCache.getCollections(source.id)) {
                items.push({
                    label: `${c.namespace}.${c.name}`,
                    description: c.version,
                    detail: c.description,
                    installUrl: c.installUrl,
                    sourceType: 'github',
                });
            }
        }

        if (items.length === 0) {
            vscode.window.showWarningMessage(
                `No collections available from ${source.name}. Try refreshing the source.`,
            );
            return;
        }

        items.sort((a, b) => a.label.localeCompare(b.label));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Install collection from ${source.name}`,
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selected) {
            await this._installCollection(selected.installUrl, selected.sourceType);
        }
    }

    /**
     * Runs `ade install` for a collection with progress feedback.
     * @param installUrl - Collection FQCN or Git URL to install.
     * @param sourceType - Whether the source is Galaxy or GitHub.
     */
    private async _installCollection(
        installUrl: string,
        sourceType: 'galaxy' | 'github',
    ): Promise<void> {
        extensionLog(`CollectionSourcesProvider: Installing ${installUrl} from ${sourceType}`);

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${installUrl}...`,
                cancellable: false,
            },
            async () => {
                const { getCommandService } = await import('@ansible/services');
                const commandService = getCommandService();

                const result = await commandService.runTool('ade', ['install', installUrl]);

                if (result.exitCode === 0) {
                    vscode.window.showInformationMessage(`Successfully installed ${installUrl}`);
                    vscode.commands.executeCommand('ansibleDevToolsCollections.refresh');
                } else {
                    vscode.window.showErrorMessage(
                        `Failed to install ${installUrl}: ${result.stderr}`,
                    );
                }
            },
        );
    }

    // -------------------------------------------------------------------
    // Plugin doc — open in webview via PluginDocPanel
    // -------------------------------------------------------------------

    /**
     * Fetches Galaxy plugin docs and opens the PluginDoc webview.
     * @param node - The Galaxy plugin tree node.
     * @param extensionUri - Extension URI for webview resource loading.
     */
    public async showGalaxyPluginDoc(
        node: GalaxyPluginNode,
        extensionUri: vscode.Uri,
    ): Promise<void> {
        const { collection, plugin, pluginType } = node;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: `Loading ${plugin.fullName}...`,
            },
            async () => {
                const data = await this._galaxyDocsCache.getPluginDoc(
                    collection.namespace,
                    collection.name,
                    collection.version,
                    plugin.fullName,
                    pluginType,
                );

                if (!data) {
                    vscode.window.showWarningMessage(
                        `Could not load documentation for ${plugin.fullName}`,
                    );
                    return;
                }

                const { PluginDocPanel } = await import('@src/panels/PluginDocPanel');
                PluginDocPanel.showWithData(extensionUri, plugin.fullName, pluginType, data);
            },
        );
    }

    /**
     * Fetches GitHub collection plugin docs via SCMDocsCache and opens the PluginDoc webview.
     * @param node - The GitHub plugin tree node.
     * @param extensionUri - Extension URI for webview resource loading.
     */
    public async showGitHubPluginDoc(
        node: GitHubPluginNode,
        extensionUri: vscode.Uri,
    ): Promise<void> {
        const { collection, plugin, pluginType } = node;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: `Loading ${plugin.fullName}...`,
            },
            async () => {
                const data = await this._scmDocsCache.getPluginDoc(
                    collection.org,
                    repoNameFrom(collection.repository),
                    collection.namespace,
                    collection.name,
                    plugin.fullName,
                    pluginType,
                );

                if (!data) {
                    vscode.window.showWarningMessage(
                        `Could not load documentation for ${plugin.fullName}`,
                    );
                    return;
                }

                const { PluginDocPanel } = await import('@src/panels/PluginDocPanel');
                PluginDocPanel.showWithData(extensionUri, plugin.fullName, pluginType, data);
            },
        );
    }

    /**
     * Invalidates and refreshes the SCM docs cache for a GitHub collection.
     * @param node - The GitHub collection tree node.
     */
    public refreshGitHubCollection(node: GitHubCollectionNode): void {
        const { collection } = node;
        this._scmDocsCache.invalidate(collection.org, repoNameFrom(collection.repository));
        this.refresh();
        vscode.window.showInformationMessage(
            `Refreshing plugin docs for ${collection.namespace}.${collection.name}...`,
        );
    }

    // -------------------------------------------------------------------
    // Search (legacy QuickPick flows — retained)
    // -------------------------------------------------------------------

    /** Searches all sources via QuickPick. */
    public async searchAllSources(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Search collections across all sources',
            placeHolder: 'e.g., network, kubernetes, azure',
        });

        if (!query) return;
        await this._showSearchResults(query, undefined);
    }

    /**
     * Searches within a specific source via QuickPick.
     * @param source - The source to search within.
     */
    public async searchSource(source: CollectionSourceInfo): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: `Search collections in ${source.name}`,
            placeHolder: 'e.g., network, kubernetes',
        });

        if (!query) return;
        await this._showSearchResults(query, source);
    }

    /**
     * Displays search results in a QuickPick with install option.
     * @param query - The search query string.
     * @param source - Optional source to scope the search.
     */
    private async _showSearchResults(query: string, source?: CollectionSourceInfo): Promise<void> {
        interface SearchResultItem extends vscode.QuickPickItem {
            installUrl: string;
            sourceType: 'galaxy' | 'github';
            sourceName: string;
        }

        const items: SearchResultItem[] = [];
        const q = query.toLowerCase();

        if (!source || source.type === 'galaxy') {
            const galaxyResults = this._galaxyCache.getCollections().filter((c) => {
                const fullName = `${c.namespace}.${c.name}`;
                return fullName.toLowerCase().includes(q);
            });

            for (const c of galaxyResults.slice(0, 50)) {
                items.push({
                    label: `$(globe) ${c.namespace}.${c.name}`,
                    description: c.version || '',
                    detail: c.deprecated
                        ? '(deprecated)'
                        : `${c.downloadCount.toLocaleString()} downloads`,
                    installUrl: `${c.namespace}.${c.name}`,
                    sourceType: 'galaxy',
                    sourceName: 'Galaxy',
                });
            }
        }

        if (!source || source.type === 'github') {
            const orgs = source ? [source.id] : this._getConfiguredOrgs();
            for (const org of orgs) {
                const results = this._githubCache.getCollections(org).filter((c) => {
                    const fullName = `${c.namespace}.${c.name}`;
                    return (
                        fullName.toLowerCase().includes(q) ||
                        c.description.toLowerCase().includes(q)
                    );
                });

                for (const c of results.slice(0, 50)) {
                    items.push({
                        label: `$(github) ${c.namespace}.${c.name}`,
                        description: `${c.version} • ${c.org}`,
                        detail: c.description,
                        installUrl: c.installUrl,
                        sourceType: 'github',
                        sourceName: c.org,
                    });
                }
            }
        }

        if (items.length === 0) {
            vscode.window.showInformationMessage(`No collections found matching "${query}"`);
            return;
        }

        items.sort((a, b) => a.label.localeCompare(b.label));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found ${String(items.length)} collection(s) - select to install`,
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selected) {
            await this._installCollection(selected.installUrl, selected.sourceType);
        }
    }

    // -------------------------------------------------------------------
    // AI
    // -------------------------------------------------------------------

    /** Generates an AI overview prompt for all collection sources. */
    public async generateAiSummary(): Promise<void> {
        const orgs = this._getConfiguredOrgs();
        const galaxyCount = this._galaxyCache.getCollections().length;
        const githubOrgs = orgs.map((org) => ({
            name: org,
            count: this._githubCache.getCount(org),
        }));
        const prompt = buildCollectionSourcesOverviewPrompt({ galaxyCount, githubOrgs });
        await openChatWithPrompt(prompt);
    }

    /**
     * Generates an AI summary prompt for a single collection source.
     * @param source - The source to summarize.
     */
    public async generateSourceAiSummary(source: CollectionSourceInfo): Promise<void> {
        const prompt =
            source.type === 'galaxy'
                ? buildGalaxySourceSummaryPrompt(source.count)
                : buildGithubOrgSourceSummaryPrompt(source.id, source.count);
        await openChatWithPrompt(prompt);
    }

    /** Disposes event listeners and subscriptions. */
    dispose(): void {
        for (const d of this._disposables) d.dispose();
    }
}
