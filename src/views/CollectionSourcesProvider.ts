import * as vscode from 'vscode';
import {
    GalaxyCollectionCache,
    GitHubCollectionCache,
    buildCollectionSourcesOverviewPrompt,
    buildGalaxySourceSummaryPrompt,
    buildGithubOrgSourceSummaryPrompt,
} from '@ansible/core';

// Logging function
let extensionLog: (msg: string) => void = console.log;

/**
 * Configure the logging function used by collection source operations.
 * @param logFn - Logger invoked for collection source status messages
 */
export function setCollectionSourcesLogFunction(logFn: (msg: string) => void): void {
    extensionLog = logFn;
}

/**
 * Open the AI chat with a prompt pre-filled.
 * Falls back to clipboard if the command doesn't support the query parameter.
 * @param prompt - Prompt text to send to chat or copy to the clipboard
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

/**
 * Represents a collection source in the tree
 */
export interface CollectionSourceInfo {
    type: 'galaxy' | 'github';
    id: string;
    name: string;
    count: number;
    lastUpdated?: Date;
    isRefreshing: boolean;
}

/** Tree item representing a Galaxy or GitHub collection source. */
class CollectionSourceNode extends vscode.TreeItem {
    /**
     * Create a collection source node with count and refresh status.
     * @param source - Metadata describing the collection source
     */
    constructor(public readonly source: CollectionSourceInfo) {
        super(source.name, vscode.TreeItemCollapsibleState.None);

        // Icon based on source type
        if (source.type === 'galaxy') {
            this.iconPath = new vscode.ThemeIcon('globe');
        } else {
            this.iconPath = new vscode.ThemeIcon('github');
        }

        // Description with count
        if (source.isRefreshing) {
            this.description = 'Refreshing...';
        } else {
            this.description = `${source.count.toLocaleString()} collections`;
        }

        // Tooltip with last updated
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${source.name}**\n\n`);
        tooltip.appendMarkdown(
            `**Type:** ${source.type === 'galaxy' ? 'Ansible Galaxy' : 'GitHub Organization'}\n\n`,
        );
        tooltip.appendMarkdown(`**Collections:** ${source.count.toLocaleString()}\n\n`);
        if (source.lastUpdated) {
            tooltip.appendMarkdown(`**Last Updated:** ${source.lastUpdated.toLocaleString()}`);
        }
        this.tooltip = tooltip;

        // Context value for menus
        this.contextValue = 'collectionSource';
    }
}

/** Tree view provider for Galaxy and GitHub collection sources. */
export class CollectionSourcesProvider implements vscode.TreeDataProvider<CollectionSourceNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<
        CollectionSourceNode | undefined | null
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _galaxyCache: GalaxyCollectionCache;
    private _githubCache: GitHubCollectionCache;
    private _disposables: vscode.Disposable[] = [];

    /** Create the provider and initialize configured collection source caches. */
    constructor() {
        this._galaxyCache = GalaxyCollectionCache.getInstance();
        this._githubCache = GitHubCollectionCache.getInstance();
        this._githubCache.setLogFunction(extensionLog);

        // Listen for config changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('ansibleEnvironments.githubCollectionOrgs')) {
                    this._initializeGitHubOrgs();
                    this.refresh();
                }
            }),
        );

        // Initialize
        this._initialize();
    }

    /** Load configured GitHub organizations and trigger an initial refresh. */
    private _initialize(): void {
        extensionLog('CollectionSourcesProvider: Initializing...');

        // Initialize GitHub caches for configured orgs
        this._initializeGitHubOrgs();

        this.refresh();
    }

    /** Load cached GitHub collection metadata for configured organizations. */
    private _initializeGitHubOrgs(): void {
        const orgs = this._getConfiguredOrgs();
        extensionLog(`CollectionSourcesProvider: Initializing GitHub orgs: ${orgs.join(', ')}`);

        // Load from disk (don't force refresh on init)
        for (const org of orgs) {
            this._githubCache.loadFromDisk(org);
        }
    }

    /**
     * Read configured GitHub organization names from workspace settings.
     * @returns GitHub organization names used as collection sources
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

    /** Notify the tree that source metadata changed. */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    /** Refresh Galaxy and all configured GitHub collection sources. */
    public async refreshAll(): Promise<void> {
        extensionLog('CollectionSourcesProvider: Refreshing all sources...');

        // Refresh Galaxy
        this.refresh(); // Update UI to show "Refreshing..."
        await this._galaxyCache.forceRefresh();

        // Refresh all GitHub orgs
        const orgs = this._getConfiguredOrgs();
        await this._githubCache.refreshAll(orgs);

        this.refresh();
        vscode.window.showInformationMessage('All collection sources refreshed');
    }

    /**
     * Refresh a single collection source cache.
     * @param source - Source metadata identifying Galaxy or a GitHub organization
     */
    public async refreshSource(source: CollectionSourceInfo): Promise<void> {
        extensionLog(`CollectionSourcesProvider: Refreshing source: ${source.id}`);

        this.refresh(); // Update UI to show "Refreshing..."

        if (source.type === 'galaxy') {
            await this._galaxyCache.forceRefresh();
        } else {
            await this._githubCache.refresh(source.id);
        }

        this.refresh();
        vscode.window.showInformationMessage(`${source.name} refreshed`);
    }

    /** Prompt for a GitHub organization and add it to workspace settings. */
    public async addSource(): Promise<void> {
        const orgName = await vscode.window.showInputBox({
            prompt: 'Enter GitHub organization name',
            placeHolder: 'e.g., my-org',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Organization name is required';
                }
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                    return 'Invalid organization name';
                }
                return undefined;
            },
        });

        if (!orgName) {
            return;
        }

        const config = vscode.workspace.getConfiguration('ansibleEnvironments');
        const orgs = config.get<string[]>('githubCollectionOrgs') ?? [];

        if (orgs.includes(orgName)) {
            vscode.window.showWarningMessage(`${orgName} is already configured`);
            return;
        }

        orgs.push(orgName);
        await config.update('githubCollectionOrgs', orgs, vscode.ConfigurationTarget.Workspace);

        // Refresh the new org
        await this._githubCache.refresh(orgName);
        this.refresh();

        vscode.window.showInformationMessage(`Added GitHub organization: ${orgName}`);
    }

    /**
     * Return the tree item for a collection source node.
     * @param element - Source node whose tree item should be displayed
     * @returns The node itself because source nodes extend TreeItem
     */
    getTreeItem(element: CollectionSourceNode): vscode.TreeItem {
        return element;
    }

    /**
     * Return Galaxy and configured GitHub collection sources.
     * @returns Source nodes for all configured collection catalogs
     */
    getChildren(): CollectionSourceNode[] {
        const sources: CollectionSourceNode[] = [];

        // Add Galaxy source
        const galaxyCount = this._galaxyCache.getCollections().length;
        sources.push(
            new CollectionSourceNode({
                type: 'galaxy',
                id: 'galaxy',
                name: 'Ansible Galaxy',
                count: galaxyCount,
                lastUpdated: undefined, // Galaxy cache doesn't expose exact timestamp
                isRefreshing: this._galaxyCache.isLoading(),
            }),
        );

        // Add GitHub org sources
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
     * Search across all sources
     */
    public async searchAllSources(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Search collections across all sources',
            placeHolder: 'e.g., network, kubernetes, azure',
        });

        if (!query) {
            return;
        }

        await this._showSearchResults(query, undefined);
    }

    /**
     * Search within a specific source
     * @param source - Collection source to search within
     */
    public async searchSource(source: CollectionSourceInfo): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: `Search collections in ${source.name}`,
            placeHolder: 'e.g., network, kubernetes',
        });

        if (!query) {
            return;
        }

        await this._showSearchResults(query, source);
    }

    /**
     * Install from a specific source
     * @param source - Collection source whose catalog should be browsed
     */
    public async installFromSource(source: CollectionSourceInfo): Promise<void> {
        interface InstallItem extends vscode.QuickPickItem {
            installUrl: string;
            sourceType: 'galaxy' | 'github';
        }

        const items: InstallItem[] = [];

        if (source.type === 'galaxy') {
            // Galaxy collections
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
            // GitHub org collections
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

        // Sort by name
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
     * Show search results with install option
     * @param query - Search text entered by the user
     * @param source - Optional source limiting the search scope
     */
    private async _showSearchResults(query: string, source?: CollectionSourceInfo): Promise<void> {
        interface SearchResultItem extends vscode.QuickPickItem {
            installUrl: string;
            sourceType: 'galaxy' | 'github';
            sourceName: string;
        }

        const items: SearchResultItem[] = [];
        const q = query.toLowerCase();

        // Search Galaxy
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

        // Search GitHub
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

        // Sort by name
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

    /**
     * Install a collection
     */
    public async installCollection(): Promise<void> {
        // Show unified search/install picker
        interface InstallItem extends vscode.QuickPickItem {
            installUrl: string;
            sourceType: 'galaxy' | 'github';
        }

        const items: InstallItem[] = [];

        // Add Galaxy collections
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

        // Add GitHub collections
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

        // Sort by name
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
     * Install a collection using ade from the Python environment
     * @param installUrl - Galaxy name or Git URL passed to `ade install`
     * @param sourceType - Source type used only for logging and messaging
     */
    private async _installCollection(
        installUrl: string,
        sourceType: 'galaxy' | 'github',
    ): Promise<void> {
        extensionLog(`CollectionSourcesProvider: Installing ${installUrl} from ${sourceType}`);

        // Use ade install for both Galaxy and GitHub
        // ade install supports git+https:// URLs
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${installUrl}...`,
                cancellable: false,
            },
            async () => {
                const { getCommandService } = await import('@ansible/core');
                const commandService = getCommandService();

                const result = await commandService.runTool('ade', ['install', installUrl]);

                if (result.exitCode === 0) {
                    vscode.window.showInformationMessage(`Successfully installed ${installUrl}`);
                    // Refresh installed collections view
                    vscode.commands.executeCommand('ansibleInstalledCollections.refresh');
                } else {
                    vscode.window.showErrorMessage(
                        `Failed to install ${installUrl}: ${result.stderr}`,
                    );
                }
            },
        );
    }

    /**
     * Generate AI summary for all sources
     */
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
     * Generate AI summary for a specific source
     * @param source - Collection source to summarize in chat
     */
    public async generateSourceAiSummary(source: CollectionSourceInfo): Promise<void> {
        const prompt =
            source.type === 'galaxy'
                ? buildGalaxySourceSummaryPrompt(source.count)
                : buildGithubOrgSourceSummaryPrompt(source.id, source.count);

        await openChatWithPrompt(prompt);
    }

    /** Release configuration listeners registered by the provider. */
    dispose(): void {
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}
