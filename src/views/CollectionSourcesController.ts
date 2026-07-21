import * as vscode from 'vscode';
import {
    GalaxyCollectionCache,
    GalaxyDocsCache,
    GitHubCollectionCache,
    SCMDocsCache,
    buildCollectionSourcesOverviewPrompt,
    buildGalaxySourceSummaryPrompt,
    buildGithubOrgSourceSummaryPrompt,
} from '@ansible/developer-services';
import type { GalaxyCollection, GitHubCollection, PluginInfo } from '@ansible/developer-services';
import { openChatWithPrompt } from '@src/features/chatProvider';

let extensionLog: (msg: string) => void = console.log;

/**
 * Configure the logging function used by collection source operations.
 * @param logFn - Logger invoked for collection source status messages
 */
export function setCollectionSourcesLogFunction(logFn: (msg: string) => void): void {
    extensionLog = logFn;
}

/** Metadata for a collection source (Galaxy or GitHub). */
export interface CollectionSourceInfo {
    type: 'galaxy' | 'github';
    id: string;
    name: string;
    count: number;
    lastUpdated?: Date;
    isRefreshing: boolean;
}

/** Command argument for installing a Galaxy collection from the NavTree. */
export interface GalaxyCollectionCommandArgs {
    collection: Pick<GalaxyCollection, 'namespace' | 'name'>;
}

/** Command argument for opening Galaxy plugin documentation. */
export interface GalaxyPluginDocCommandArgs {
    collection: Pick<GalaxyCollection, 'namespace' | 'name' | 'version'>;
    plugin: PluginInfo;
    pluginType: string;
}

/** Command argument for GitHub collection actions from the NavTree. */
export interface GitHubCollectionCommandArgs {
    collection: Pick<GitHubCollection, 'namespace' | 'name' | 'org' | 'repository'>;
}

/** Command argument for opening GitHub plugin documentation. */
export interface GitHubPluginDocCommandArgs {
    collection: Pick<GitHubCollection, 'namespace' | 'name' | 'org' | 'repository'>;
    plugin: PluginInfo;
    pluginType: string;
}

/**
 * Extracts the repository name from a full GitHub repository URL or path.
 * @param repository - Repository URL or path (e.g., "org/repo-name").
 * @returns The repository name portion.
 */
function repoNameFrom(repository: string): string {
    return repository.split('/').pop() ?? repository;
}

/** NavTree data source and command controller for collection sources. */
export class CollectionSourcesController {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

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
        extensionLog('CollectionSourcesController: Initializing...');
        this._initializeGitHubOrgs();
        this.refresh();
    }

    /** Loads GitHub org collections from on-disk cache. */
    private _initializeGitHubOrgs(): void {
        const orgs = this._getConfiguredOrgs();
        extensionLog(`CollectionSourcesController: Initializing GitHub orgs: ${orgs.join(', ')}`);
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

    /** Fires a change event to refresh the NavTree snapshot. */
    public refresh(): void {
        this._onDidChange.fire(undefined);
    }

    /**
     * Forces a full refresh of all Galaxy and GitHub sources.
     * @returns Resolves when all sources have been refreshed.
     */
    public async refreshAll(): Promise<void> {
        extensionLog('CollectionSourcesController: Refreshing all sources...');
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
        extensionLog(`CollectionSourcesController: Refreshing source: ${source.id}`);
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

    /**
     * Active Galaxy filter string for NavTree parity (empty when none).
     * @returns Current filter or undefined
     */
    public getGalaxyFilter(): string | undefined {
        return this._galaxyFilter;
    }

    /**
     * Installs a Galaxy collection from a NavTree action.
     * @param args - Galaxy collection reference from the NavTree snapshot
     */
    public async installGalaxyCollection(args: GalaxyCollectionCommandArgs): Promise<void> {
        const fqcn = `${args.collection.namespace}.${args.collection.name}`;
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
        extensionLog(`CollectionSourcesController: Installing ${installUrl} from ${sourceType}`);

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${installUrl}...`,
                cancellable: false,
            },
            async () => {
                const { getCommandService } = await import('@ansible/developer-services');
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

    /**
     * Fetches Galaxy plugin docs and opens the PluginDoc webview.
     * @param args - Plugin and collection references from the NavTree snapshot
     * @param extensionUri - Extension URI for webview resource loading.
     */
    public async showGalaxyPluginDoc(
        args: GalaxyPluginDocCommandArgs,
        extensionUri: vscode.Uri,
    ): Promise<void> {
        const { collection, plugin, pluginType } = args;

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
     * @param args - Plugin and collection references from the NavTree snapshot
     * @param extensionUri - Extension URI for webview resource loading.
     */
    public async showGitHubPluginDoc(
        args: GitHubPluginDocCommandArgs,
        extensionUri: vscode.Uri,
    ): Promise<void> {
        const { collection, plugin, pluginType } = args;

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
     * @param args - GitHub collection reference from the NavTree snapshot
     */
    public refreshGitHubCollection(args: GitHubCollectionCommandArgs): void {
        const { collection } = args;
        this._scmDocsCache.invalidate(collection.org, repoNameFrom(collection.repository));
        this.refresh();
        vscode.window.showInformationMessage(
            `Refreshing plugin docs for ${collection.namespace}.${collection.name}...`,
        );
    }

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
