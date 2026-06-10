import * as fs from 'fs';
import * as path from 'path';

import { log } from '../utils/logging';
import { SimpleEventEmitter } from '../utils/SimpleEventEmitter';

// Conditional vscode import - only used when available
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone (not in VS Code)
}

// Cache configuration
const CACHE_DIR = '.cache/ansible-environments';
const COLLECTIONS_CACHE_FILE = 'collections-metadata.json';

interface CollectionsCache {
    timestamp: string;
    collections: {
        name: string;
        info: CollectionInfo;
        pluginTypes: {
            type: string;
            plugins: PluginInfo[];
        }[];
    }[];
    pluginDocs?: Record<string, PluginData>;
}

/**
 * Information about an Ansible collection
 */
export interface CollectionInfo {
    name: string;
    version: string;
    authors: string[];
    description: string;
    path?: string;
}

/**
 * Information about a plugin within a collection
 */
export interface PluginInfo {
    name: string;
    fullName: string;
    shortDescription: string;
}

/**
 * A collection with its plugins organized by type
 */
export interface CollectionData {
    info: CollectionInfo;
    pluginTypes: Map<string, PluginInfo[]>;
}

/**
 * Plugin documentation option
 */
export interface PluginOption {
    description?: string | string[];
    type?: string;
    default?: unknown;
    choices?: string[];
    required?: boolean;
    elements?: string;
    aliases?: string[];
    suboptions?: Record<string, PluginOption>;
    version_added?: string;
}

/**
 * Plugin documentation structure
 */
export interface PluginDoc {
    author?: string | string[];
    collection?: string;
    description?: string | string[];
    short_description?: string;
    module?: string;
    plugin_name?: string;
    version_added?: string;
    notes?: string | string[];
    options?: Record<string, PluginOption>;
    seealso?: { module?: string; description?: string; link?: string; name?: string }[];
    requirements?: string | string[];
    attributes?: Record<string, unknown>;
}

/**
 * Plugin return value documentation
 */
export type PluginReturn = Record<
    string,
    {
        description?: string | string[];
        returned?: string;
        type?: string;
        sample?: unknown;
        contains?: Record<string, unknown>;
    }
>;

/**
 * Complete plugin data including documentation, examples, and return values
 */
export interface PluginData {
    doc?: PluginDoc;
    examples?: string;
    return?: PluginReturn;
    metadata?: unknown;
}

// Internal types for parsing -- these match the full ansible-doc --metadata-dump output
interface MetadataEntry {
    doc?: PluginDoc;
    examples?: string;
    return?: PluginReturn;
    metadata?: unknown;
}

type MetadataPluginTypes = Record<string, Record<string, MetadataEntry>>;

interface MetadataDump {
    all?: MetadataPluginTypes;
}

interface AdeCollectionInfo {
    path?: string;
    collection_info: {
        version: string;
        authors: string[];
        description: string;
    };
}

type AdeInspectOutput = Record<string, AdeCollectionInfo>;

// Command execution is now handled by CommandService

/**
 * Resolves the workspace root from VS Code or the current working directory.
 *
 * @returns Absolute workspace path, or null when no folder is open.
 */
function getWorkspaceRoot(): string | null {
    if (vscode?.workspace.workspaceFolders?.[0]) {
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        console.log(`CollectionsService: Workspace root: ${root}`);
        return root;
    }
    const cwd = process.cwd();
    console.log(`CollectionsService: Using cwd as workspace root: ${cwd}`);
    return cwd;
}

/**
 * Builds the path to the collections plugin cache file for the workspace.
 *
 * @returns Absolute cache file path, or null when no workspace root exists.
 */
function getCollectionsCachePath(): string | null {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return null;
    }
    return path.join(workspaceRoot, CACHE_DIR, COLLECTIONS_CACHE_FILE);
}

/**
 * Creates the collections cache directory under the workspace when missing.
 *
 * @returns True when the directory exists or was created successfully.
 */
function ensureCacheDir(): boolean {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return false;
    }

    const cacheDir = path.join(workspaceRoot, CACHE_DIR);
    try {
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Reads and parses the collections plugin cache from disk.
 *
 * @returns Parsed cache payload, or null when the file is missing or unreadable.
 */
function readCollectionsCache(): CollectionsCache | null {
    const cachePath = getCollectionsCachePath();
    if (!cachePath) {
        logMessage('No cache path available (no workspace?)');
        return null;
    }

    try {
        if (fs.existsSync(cachePath)) {
            const content = fs.readFileSync(cachePath, 'utf8');
            const cache = JSON.parse(content) as CollectionsCache;
            const ageMs = Date.now() - new Date(cache.timestamp).getTime();
            const ageStr =
                ageMs < 60000
                    ? 'just now'
                    : ageMs < 3600000
                      ? `${String(Math.round(ageMs / 60000))} min ago`
                      : `${String(Math.round(ageMs / 3600000))} hour(s) ago`;
            logMessage(`Cache loaded: ${String(cache.collections.length)} collections (${ageStr})`);
            return cache;
        } else {
            logMessage(`Cache file not found at ${cachePath}`);
        }
    } catch (error) {
        logMessage(
            `Failed to read cache: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    return null;
}

/**
 * Log a message via shared logging (extension or console fallback).
 *
 * @param message - Diagnostic text prefixed with CollectionsService.
 */
function logMessage(message: string): void {
    log(`CollectionsService: ${message}`);
}

/**
 * Persists collection metadata and plugin docs to the workspace cache file.
 *
 * @param collections - In-memory collection map to serialize.
 * @param pluginDocs - In-memory plugin documentation map to serialize.
 * @returns True when the cache file was written successfully.
 */
function writeCollectionsCache(
    collections: Map<string, CollectionData>,
    pluginDocs: Map<string, PluginData>,
): boolean {
    if (!ensureCacheDir()) {
        return false;
    }

    const cachePath = getCollectionsCachePath();
    if (!cachePath) {
        return false;
    }

    try {
        const docsObj = Object.create(null) as Record<string, PluginData>;
        for (const [key, data] of pluginDocs) {
            docsObj[key] = data;
        }

        const cache: CollectionsCache = {
            timestamp: new Date().toISOString(),
            collections: Array.from(collections.entries()).map(([name, data]) => ({
                name,
                info: data.info,
                pluginTypes: Array.from(data.pluginTypes.entries()).map(([type, plugins]) => ({
                    type,
                    plugins,
                })),
            })),
            pluginDocs: docsObj,
        };

        fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
        return true;
    } catch (error) {
        console.error('Failed to write collections cache:', error);
        return false;
    }
}

interface CacheResult {
    collections: Map<string, CollectionData>;
    pluginDocs: Map<string, PluginData>;
}

/**
 * Converts serialized cache data back into in-memory Map structures.
 *
 * @param cache - Parsed collections cache read from disk.
 * @returns Collection and plugin documentation maps ready for service use.
 */
function cacheToMaps(cache: CollectionsCache): CacheResult {
    const collections = new Map<string, CollectionData>();

    for (const item of cache.collections) {
        const pluginTypes = new Map<string, PluginInfo[]>();
        for (const pt of item.pluginTypes) {
            pluginTypes.set(pt.type, pt.plugins);
        }
        collections.set(item.name, {
            info: item.info,
            pluginTypes,
        });
    }

    const pluginDocs = new Map<string, PluginData>();
    if (cache.pluginDocs) {
        for (const [key, data] of Object.entries(cache.pluginDocs)) {
            pluginDocs.set(key, data);
        }
    }

    return { collections, pluginDocs };
}

/**
 * Service for managing Ansible collections and plugin documentation.
 * This service works both in VS Code and standalone (for MCP server).
 */
export class CollectionsService {
    private static _instance: CollectionsService | undefined;
    private _collections = new Map<string, CollectionData>();
    private _pluginDocs = new Map<string, PluginData>();
    private _loading = false;
    private _loaded = false;
    private _backgroundRefreshing = false;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;

    /**
     * Initializes change notifications using VS Code or a standalone event emitter.
     */
    private constructor() {
        // Use VS Code EventEmitter if available, otherwise use simple implementation
        if (vscode) {
            const emitter = new vscode.EventEmitter<void>();
            this._onDidChange = emitter;
            this.onDidChange = emitter.event;
        } else {
            const emitter = new SimpleEventEmitter<void>();
            this._onDidChange = emitter;
            this.onDidChange = emitter.event;
        }
    }

    /**
     * Returns the shared CollectionsService instance.
     *
     * @returns Singleton service for collection and plugin documentation.
     */
    public static getInstance(): CollectionsService {
        CollectionsService._instance ??= new CollectionsService();
        return CollectionsService._instance;
    }

    /**
     * Indicates whether the service is running inside the VS Code extension host.
     *
     * @returns True when the vscode module is available.
     */
    public isInVSCode(): boolean {
        return vscode !== undefined;
    }

    /**
     * Check if the service is currently loading data.
     *
     * @returns True while a full collection index load is in progress.
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Check if the service has loaded data.
     *
     * @returns True after collections are available from cache or a full load.
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Get all loaded collections.
     *
     * @returns Map of collection FQCN to metadata and plugin type index.
     */
    public getCollections(): Map<string, CollectionData> {
        return this._collections;
    }

    /**
     * Get a specific collection by name.
     *
     * @param name - Fully qualified collection name.
     * @returns Collection metadata and plugin index, or undefined when not loaded.
     */
    public getCollection(name: string): CollectionData | undefined {
        return this._collections.get(name);
    }

    /**
     * List all collection names.
     *
     * @returns Sorted fully qualified collection names from the loaded index.
     */
    public listCollectionNames(): string[] {
        return Array.from(this._collections.keys()).sort();
    }

    /**
     * Get plugins for a specific collection and type.
     *
     * @param collectionName - Fully qualified collection name.
     * @param pluginType - Plugin category such as module or lookup.
     * @returns Plugin entries for the collection and type, or an empty array.
     */
    public getPlugins(collectionName: string, pluginType: string): PluginInfo[] {
        const collection = this._collections.get(collectionName);
        if (!collection) {
            return [];
        }
        return collection.pluginTypes.get(pluginType) ?? [];
    }

    /**
     * List all plugin types for a collection.
     *
     * @param collectionName - Fully qualified collection name.
     * @returns Sorted plugin type names available in the collection.
     */
    public listPluginTypes(collectionName: string): string[] {
        const collection = this._collections.get(collectionName);
        if (!collection) {
            return [];
        }
        return Array.from(collection.pluginTypes.keys()).sort();
    }

    /**
     * Search for plugins across all collections.
     *
     * @param query - Case-insensitive match against plugin name, FQCN, or description.
     * @returns Matching plugins with their collection and plugin type context.
     */
    public searchPlugins(
        query: string,
    ): { collection: string; pluginType: string; plugin: PluginInfo }[] {
        const results: { collection: string; pluginType: string; plugin: PluginInfo }[] = [];
        const lowerQuery = query.toLowerCase();

        for (const [collectionName, collection] of this._collections) {
            for (const [pluginType, plugins] of collection.pluginTypes) {
                for (const plugin of plugins) {
                    if (
                        plugin.name.toLowerCase().includes(lowerQuery) ||
                        plugin.fullName.toLowerCase().includes(lowerQuery) ||
                        plugin.shortDescription.toLowerCase().includes(lowerQuery)
                    ) {
                        results.push({ collection: collectionName, pluginType, plugin });
                    }
                }
            }
        }

        return results;
    }

    /**
     * Writes a diagnostic message through the shared CollectionsService logger.
     *
     * @param message - Log text forwarded to logMessage.
     */
    private _log(message: string): void {
        logMessage(message);
    }

    /**
     * Refresh the collections data
     * - If cache exists, load from cache immediately and refresh in background
     * - If no cache, show loading state while fetching
     * - Never blanks the view - keeps existing data visible during refresh
     */
    public async refresh(): Promise<void> {
        if (this._loading) {
            this._log('Refresh skipped - already loading');
            return;
        }

        this._log('Starting refresh');

        // Try to load from cache first for instant UI
        const cache = readCollectionsCache();
        if (cache) {
            this._log(
                `Cache found with ${String(cache.collections.length)} collections from ${cache.timestamp}`,
            );
            const cached = cacheToMaps(cache);
            this._collections = cached.collections;
            this._pluginDocs = cached.pluginDocs;
            this._loaded = true;
            (this._onDidChange as { fire: () => void }).fire();

            // Background refresh to update cache (don't await)
            void this._backgroundRefresh();
            return;
        }

        this._log('No cache found, doing full load');

        // No cache - do full load with loading state
        this._loading = true;
        (this._onDidChange as { fire: () => void }).fire();

        try {
            await this._doFullLoad();
            this._loaded = true;

            // Save to cache
            writeCollectionsCache(this._collections, this._pluginDocs);
            this._log(
                `Full load complete, ${String(this._collections.size)} collections, ${String(this._pluginDocs.size)} plugin docs cached`,
            );
        } catch (error) {
            this._log(
                `Full load failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Force a fresh refresh of collections, bypassing cache
     * Use this when you need the absolute latest collection data
     */
    public async forceRefresh(): Promise<void> {
        this._log('Force refresh requested - doing full load');
        this._loading = true;
        (this._onDidChange as { fire: () => void }).fire();

        try {
            await this._doFullLoad();
            this._loaded = true;

            // Save to cache
            writeCollectionsCache(this._collections, this._pluginDocs);
            this._log(
                `Force refresh complete, ${String(this._collections.size)} collections, ${String(this._pluginDocs.size)} plugin docs cached`,
            );
        } catch (error) {
            this._log(
                `Force refresh failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Perform a full load of collections
     */
    private async _doFullLoad(): Promise<void> {
        this._collections.clear();
        this._pluginDocs.clear();
        await this._loadCollectionsWithCommandService();
    }

    /**
     * Background refresh - updates cache and view if data changed
     * Keeps existing data visible while refreshing
     */
    private async _backgroundRefresh(): Promise<void> {
        // Prevent multiple concurrent background refreshes
        if (this._backgroundRefreshing) {
            this._log('Background refresh already in progress, skipping');
            return;
        }
        this._backgroundRefreshing = true;
        this._log('Starting background refresh');

        // Show status bar message if in VS Code
        let statusDisposable: { dispose: () => void } | undefined;
        if (vscode) {
            statusDisposable = vscode.window.setStatusBarMessage(
                '$(sync~spin) Updating collections index...',
            );
        }

        try {
            // Load into temporary maps WITHOUT touching this._collections/_pluginDocs
            const tempCollections = new Map<string, CollectionData>();
            const tempDocs = new Map<string, PluginData>();
            const oldCount = this._collections.size;

            await this._loadCollectionsWithCommandService(tempCollections, tempDocs);

            // Now swap atomically after load is complete
            const newCount = tempCollections.size;
            this._collections = tempCollections;
            this._pluginDocs = tempDocs;

            this._log(
                `Background refresh complete: ${String(oldCount)} -> ${String(newCount)} collections, ${String(tempDocs.size)} plugin docs`,
            );

            // Always update cache with fresh data
            writeCollectionsCache(this._collections, this._pluginDocs);

            // Only update UI if data changed
            if (oldCount !== newCount) {
                this._log('Data changed, updating UI');
                (this._onDidChange as { fire: () => void }).fire();
                if (vscode) {
                    vscode.window.setStatusBarMessage(
                        `$(check) Collections updated (${String(newCount)} collections)`,
                        3000,
                    );
                }
            } else {
                this._log('No data change, UI unchanged');
                if (vscode) {
                    vscode.window.setStatusBarMessage(
                        `$(check) Collections index up to date`,
                        2000,
                    );
                }
            }
        } catch (error) {
            this._log(
                `Background refresh failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            if (vscode) {
                vscode.window.setStatusBarMessage(`$(error) Collections refresh failed`, 3000);
            }
            // Don't clear collections on error - keep existing data
        } finally {
            this._backgroundRefreshing = false;
            statusDisposable?.dispose();
        }
    }

    /**
     * Get detailed documentation for a specific plugin.
     * Returns instantly from the in-memory cache (populated from
     * ansible-doc --metadata-dump). Falls back to a per-plugin
     * ansible-doc subprocess only if the plugin is not in the cache.
     *
     * @param pluginFullName - Fully qualified plugin name.
     * @param pluginType - Plugin category used to build the ansible-doc type flag.
     * @returns Plugin documentation object, or null when lookup fails.
     */
    public async getPluginDocumentation(
        pluginFullName: string,
        pluginType: string,
    ): Promise<PluginData | null> {
        const docKey = `${pluginFullName}:${pluginType}`;
        const cached = this._pluginDocs.get(docKey);
        if (cached) {
            return cached;
        }

        this._log(`Cache miss for ${docKey}, falling back to ansible-doc subprocess`);
        const typeFlag = this._getTypeFlag(pluginType);

        const { getCommandService } = await import('./CommandService');
        const commandService = getCommandService();

        try {
            const result = await commandService.runTool(
                'ansible-doc',
                [typeFlag, `"${pluginFullName}"`, '--json'],
                {
                    env: { ANSIBLE_NOCOLOR: '1' },
                },
            );

            const output = result.stdout;

            const jsonStart = output.indexOf('{');
            if (jsonStart === -1) {
                console.error(`No JSON found in ansible-doc output for ${pluginFullName}`);
                return null;
            }

            const jsonStr = output.substring(jsonStart);
            const data = JSON.parse(jsonStr) as Record<string, PluginData | undefined>;
            const pluginData = data[pluginFullName] ?? null;

            if (pluginData) {
                this._pluginDocs.set(docKey, pluginData);
            }

            return pluginData;
        } catch (error) {
            console.error(
                `Failed to get plugin documentation: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    /**
     * Install an Ansible collection from Galaxy via ade and refresh the local index.
     *
     * @param collectionName - FQCN of the collection (e.g., "community.docker").
     * @param version - Optional version to install (e.g., "1.0.0").
     * @param force - When true, force reinstall or upgrade of the collection.
     * @returns Install command stdout or a success message when stdout is empty.
     */
    public async installCollection(
        collectionName: string,
        version?: string,
        force?: boolean,
    ): Promise<string> {
        const { getCommandService } = await import('./CommandService');
        const commandService = getCommandService();

        // Build collection spec with optional version
        const collectionSpec = version ? `${collectionName}:${version}` : collectionName;

        // Build args - use --force for upgrades/reinstalls
        const args = ['install', collectionSpec];
        if (force) {
            args.push('--force');
        }

        const result = await commandService.runTool('ade', args);

        if (result.exitCode === 0) {
            // Trigger a refresh to pick up the newly installed collection
            // This will fire onDidChange event to notify consumers (e.g., PluginSearchIndex)
            await this.forceRefresh();

            return result.stdout || `Successfully installed ${collectionName}`;
        } else {
            throw new Error(`Failed to install ${collectionName}: ${result.stderr}`);
        }
    }

    /**
     * List all installed Ansible collections
     *
     * @returns Array of installed collections with version info
     */
    public async listInstalledCollections(): Promise<CollectionInfo[]> {
        const { getCommandService } = await import('./CommandService');
        const commandService = getCommandService();
        const collections: CollectionInfo[] = [];

        try {
            const result = await commandService.runTool('ansible-galaxy', [
                'collection',
                'list',
                '--format',
                'json',
            ]);

            if (result.exitCode === 0 && result.stdout) {
                try {
                    // The output may contain warnings and version info before the JSON
                    // We need to extract just the JSON part (starts with '{' and ends with '}')
                    const stdout = result.stdout;
                    const jsonStart = stdout.indexOf('{');
                    const jsonEnd = stdout.lastIndexOf('}');

                    if (jsonStart === -1 || jsonEnd === -1) {
                        console.error('CollectionsService: No JSON object found in output');
                        return collections;
                    }

                    const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
                    const parsed = JSON.parse(jsonStr) as Record<
                        string,
                        Record<string, { version: string }>
                    >;

                    // Format is { "path": { "namespace.name": { "version": "x.y.z" } } }
                    // Use a Set to deduplicate collections that appear in multiple paths
                    const seen = new Set<string>();

                    for (const pathCollections of Object.values(parsed)) {
                        for (const [name, info] of Object.entries(pathCollections)) {
                            if (typeof info === 'object' && 'version' in info) {
                                // Skip duplicates and internal collections
                                if (seen.has(name) || name.startsWith('ansible._')) {
                                    continue;
                                }
                                seen.add(name);
                                collections.push({
                                    name,
                                    version: info.version,
                                    authors: [],
                                    description: '',
                                });
                            }
                        }
                    }
                    console.log(
                        `CollectionsService: Found ${String(collections.length)} installed collections`,
                    );
                } catch (parseError) {
                    console.error('CollectionsService: Failed to parse JSON:', parseError);
                    console.error(
                        'CollectionsService: stdout was:',
                        result.stdout.substring(0, 500),
                    );
                    // Fallback: try line-by-line parsing for non-JSON output
                    const lines = result.stdout.split('\n');
                    for (const line of lines) {
                        const match = /^(\w+\.\w+)\s+([\d.]+)/.exec(line);
                        if (match) {
                            collections.push({
                                name: match[1],
                                version: match[2],
                                authors: [],
                                description: '',
                            });
                        }
                    }
                }
            } else {
                console.error('CollectionsService: ansible-galaxy command failed:', result.stderr);
            }
        } catch (error) {
            console.error('CollectionsService: Failed to list installed collections:', error);
        }

        return collections;
    }

    /**
     * Maps a plugin type to the corresponding ansible-doc -t flag fragment.
     *
     * @param pluginType - Plugin category such as module or lookup.
     * @returns ansible-doc type flag string, or empty when the type is unknown.
     */
    private _getTypeFlag(pluginType: string): string {
        const typeMap: Record<string, string> = {
            module: '-t module',
            become: '-t become',
            cache: '-t cache',
            callback: '-t callback',
            cliconf: '-t cliconf',
            connection: '-t connection',
            filter: '-t filter',
            httpapi: '-t httpapi',
            inventory: '-t inventory',
            lookup: '-t lookup',
            netconf: '-t netconf',
            shell: '-t shell',
            strategy: '-t strategy',
            test: '-t test',
            vars: '-t vars',
            role: '-t role',
            keyword: '-t keyword',
        };
        return typeMap[pluginType] || '';
    }

    /**
     * Loads collection metadata via ade inspect and plugin docs via ansible-doc.
     *
     * @param targetMap - Optional map to populate instead of the service instance maps.
     * @param targetDocs - Optional plugin doc map used during background refresh.
     */
    private async _loadCollectionsWithCommandService(
        targetMap?: Map<string, CollectionData>,
        targetDocs?: Map<string, PluginData>,
    ): Promise<void> {
        const { getCommandService } = await import('./CommandService');
        const commandService = getCommandService();

        const collections = targetMap ?? this._collections;
        const pluginDocs = targetDocs ?? this._pluginDocs;
        try {
            // Run ade inspect and ansible-doc in parallel for speed
            const adePromise = (async () => {
                try {
                    // Get venv path for ade inspect if available
                    const binDir = await commandService.getBinDir();
                    const envPath = binDir ? path.dirname(binDir) : undefined;

                    const args = envPath
                        ? ['inspect', '--venv', envPath, '--no-ansi']
                        : ['inspect', '--no-ansi'];

                    const result = await commandService.runTool('ade', args);
                    if (result.exitCode === 0 && result.stdout) {
                        return JSON.parse(result.stdout) as AdeInspectOutput;
                    }
                    return null;
                } catch {
                    console.error(
                        'CollectionsService: ade inspect not available, collection metadata will be limited',
                    );
                    return null;
                }
            })();

            // Set ANSIBLE_COLLECTIONS_PATH=. to isolate to workspace
            // ansible-doc still finds venv site-packages collections via Python's sys.path
            // This prevents picking up stray collections from ~/.ansible/collections
            const ansibleDocPromise = commandService.runTool(
                'ansible-doc',
                ['--metadata-dump', '--no-fail-on-errors'],
                {
                    env: {
                        ANSIBLE_COLLECTIONS_PATH: '.',
                        ANSIBLE_WARNINGS: 'false',
                        ANSIBLE_NOCOLOR: '1',
                    },
                    maxBuffer: 50 * 1024 * 1024,
                },
            );

            // Wait for both to complete
            const [adeData, ansibleDocResult] = await Promise.all([adePromise, ansibleDocPromise]);
            const result = ansibleDocResult.stdout;

            // Build collection info map from ade data
            const collectionInfoMap = new Map<string, CollectionInfo>();
            if (adeData) {
                for (const [collName, collData] of Object.entries(adeData)) {
                    collectionInfoMap.set(collName, {
                        name: collName,
                        version: collData.collection_info.version,
                        authors: collData.collection_info.authors,
                        description: collData.collection_info.description,
                        path: collData.path,
                    });
                }
            }

            // Find the start of JSON (ansible-doc might output warnings before the JSON)
            const jsonStart = result.indexOf('{');
            if (jsonStart === -1) {
                console.error('CollectionsService: No JSON found in ansible-doc output');
                console.error('Output starts with:', result.substring(0, 100));
                return;
            }

            const jsonStr = result.substring(jsonStart);

            // Parse the JSON output
            let metadata: MetadataDump;
            try {
                metadata = JSON.parse(jsonStr) as MetadataDump;
            } catch (parseError) {
                console.error('CollectionsService: Failed to parse ansible-doc JSON');
                console.error('JSON starts with:', jsonStr.substring(0, 200));
                throw parseError;
            }

            if (!metadata.all) {
                return;
            }

            // Use a Set to track unique plugins globally
            const seenPlugins = new Set<string>();

            // Process each plugin type
            for (const [pluginType, plugins] of Object.entries(metadata.all)) {
                for (const [fullName, pluginData] of Object.entries(plugins)) {
                    const doc = pluginData.doc;
                    if (!doc) {
                        continue;
                    }

                    const collectionName = doc.collection ?? 'unknown';
                    const pluginName =
                        doc.plugin_name?.split('.').pop() ?? fullName.split('.').pop() ?? fullName;
                    const shortDescription = doc.short_description ?? '';

                    // Create unique key to prevent duplicates
                    const uniqueKey = `${collectionName}:${pluginType}:${fullName}`;
                    if (seenPlugins.has(uniqueKey)) {
                        continue;
                    }
                    seenPlugins.add(uniqueKey);

                    // Store full plugin documentation from the metadata dump
                    const docKey = `${fullName}:${pluginType}`;
                    pluginDocs.set(docKey, {
                        doc: pluginData.doc,
                        examples: pluginData.examples,
                        return: pluginData.return,
                        metadata: pluginData.metadata,
                    });

                    // Get or create collection
                    let collection = collections.get(collectionName);
                    if (!collection) {
                        const info = collectionInfoMap.get(collectionName) ?? {
                            name: collectionName,
                            version: '',
                            authors: [],
                            description: '',
                        };
                        collection = {
                            info,
                            pluginTypes: new Map(),
                        };
                        collections.set(collectionName, collection);
                    }

                    // Get or create plugin type
                    let plugins = collection.pluginTypes.get(pluginType);
                    if (!plugins) {
                        plugins = [];
                        collection.pluginTypes.set(pluginType, plugins);
                    }

                    plugins.push({
                        name: pluginName,
                        fullName: fullName,
                        shortDescription: shortDescription,
                    });
                }
            }

            // Sort plugins within each type
            for (const collection of collections.values()) {
                for (const plugins of collection.pluginTypes.values()) {
                    plugins.sort((a, b) => a.name.localeCompare(b.name));
                }
            }
        } catch (error) {
            console.error('CollectionsService: Failed to load collections:', error);
            throw error;
        }
    }
}

export { setLogFunction } from '../utils/logging';
