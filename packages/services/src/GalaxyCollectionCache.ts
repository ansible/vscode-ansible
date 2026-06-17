// Try to import vscode - will fail in standalone MCP mode
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running in standalone mode (MCP server)
    vscode = undefined;
}

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { log, SimpleEventEmitter } from '@ansible/common';

export interface GalaxyCollection {
    namespace: string;
    name: string;
    version: string;
    deprecated: boolean;
    downloadCount: number;
}

interface CacheData {
    timestamp: number;
    collections: GalaxyCollection[];
}

interface GalaxyApiResponse {
    meta: { count: number };
    links: { next: string | null };
    data: {
        namespace: string;
        name: string;
        deprecated: boolean;
        download_count?: number;
        highest_version?: { version: string };
    }[];
}

const CACHE_FILE_NAME = 'galaxy-collections-cache.json';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

interface StatusBarItemLike {
    text: string;
    tooltip?: string;
    show(): void;
    hide(): void;
}

interface ExtensionContextLike {
    globalStorageUri: { fsPath: string };
}

/**
 * Type guard that validates parsed JSON matches the on-disk cache shape.
 *
 * @param value - Parsed JSON value read from the cache file.
 * @returns True when value contains a timestamp and collections array.
 */
function isCacheData(value: unknown): value is CacheData {
    return (
        typeof value === 'object' &&
        value !== null &&
        'timestamp' in value &&
        'collections' in value &&
        Array.isArray((value as CacheData).collections)
    );
}

/**
 * Caches Ansible Galaxy collection metadata from the public API with file persistence.
 */
export class GalaxyCollectionCache {
    private static _instance: GalaxyCollectionCache | undefined;
    private _collections: GalaxyCollection[] = [];
    private _loading = false;
    private _loaded = false;
    private _loadPromise: Promise<void> | undefined;
    private _statusBarItem: StatusBarItemLike | undefined;
    private _onDidLoad = vscode ? new vscode.EventEmitter<void>() : new SimpleEventEmitter<void>();
    public readonly onDidLoad = this._onDidLoad.event;
    private _totalCount = 0;
    private _loadedCount = 0;
    private _onDidUpdateProgress = vscode
        ? new vscode.EventEmitter<{ loaded: number; total: number }>()
        : new SimpleEventEmitter<{ loaded: number; total: number }>();
    public readonly onDidUpdateProgress = this._onDidUpdateProgress.event;
    private _extensionContext: ExtensionContextLike | undefined;
    private _cacheTimestamp = 0;
    private _standaloneMode = !vscode;

    /**
     * Creates the cache and optional VS Code status bar item for load progress.
     */
    private constructor() {
        if (vscode) {
            this._statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Left,
                0,
            ) as StatusBarItemLike;
        }
    }

    /**
     * Stores the VS Code extension context used to resolve global storage paths.
     *
     * @param context - Extension context providing globalStorageUri.
     */
    public setExtensionContext(context: ExtensionContextLike): void {
        this._extensionContext = context;
    }

    /**
     * Resolves the on-disk cache file path for extension or standalone mode.
     *
     * @returns Absolute cache file path, or undefined when no location is available.
     */
    private get _cacheFilePath(): string | undefined {
        // In extension mode, use extension context's global storage
        if (this._extensionContext) {
            return path.join(this._extensionContext.globalStorageUri.fsPath, CACHE_FILE_NAME);
        }

        // In standalone mode, use ~/.vscode/extensions/cidrblock.ansible-environments/ or fallback
        if (this._standaloneMode) {
            // Try to find the extension's global storage in standard locations
            const vscodeDir = path.join(
                os.homedir(),
                '.vscode',
                'extensions',
                'cidrblock.ansible-environments-0.0.1',
            );
            const cursorDir = path.join(
                os.homedir(),
                '.cursor',
                'extensions',
                'cidrblock.ansible-environments-0.0.1',
            );

            // Check which exists
            if (fs.existsSync(vscodeDir)) {
                return path.join(vscodeDir, CACHE_FILE_NAME);
            }
            if (fs.existsSync(cursorDir)) {
                return path.join(cursorDir, CACHE_FILE_NAME);
            }

            // Fallback to home directory
            const fallbackDir = path.join(os.homedir(), '.ansible-environments');
            if (!fs.existsSync(fallbackDir)) {
                fs.mkdirSync(fallbackDir, { recursive: true });
            }
            return path.join(fallbackDir, CACHE_FILE_NAME);
        }

        return undefined;
    }

    /**
     * Returns the current Galaxy API pagination progress counters.
     *
     * @returns Loaded and total collection counts from the in-flight fetch.
     */
    public getProgress(): { loaded: number; total: number } {
        return { loaded: this._loadedCount, total: this._totalCount };
    }

    /**
     * Returns the shared GalaxyCollectionCache instance.
     *
     * @returns Singleton cache for Galaxy collection metadata.
     */
    public static getInstance(): GalaxyCollectionCache {
        GalaxyCollectionCache._instance ??= new GalaxyCollectionCache();
        return GalaxyCollectionCache._instance;
    }

    /**
     * Indicates whether collection metadata has been loaded into memory.
     *
     * @returns True after a successful file or API load completes.
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Indicates whether a Galaxy API fetch is currently in progress.
     *
     * @returns True while collections are being downloaded or parsed.
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Returns the cached Galaxy collections sorted by popularity.
     *
     * @returns In-memory collection list from the latest successful load.
     */
    public getCollections(): GalaxyCollection[] {
        return this._collections;
    }

    /**
     * Returns a human-readable age string for the current cache timestamp.
     *
     * @returns Relative age such as "3 days ago", or "never" when uncached.
     */
    public getCacheAge(): string {
        if (this._cacheTimestamp === 0) {
            return 'never';
        }
        const ageMs = Date.now() - this._cacheTimestamp;
        const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

        if (days > 0) {
            return `${String(days)} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${String(hours)} hour${hours > 1 ? 's' : ''} ago`;
        } else {
            return 'just now';
        }
    }

    /**
     * Ensures collections are loaded, awaiting any in-flight background fetch.
     *
     * @returns Promise that resolves when collections are available in memory.
     */
    public async ensureLoaded(): Promise<void> {
        if (this._loaded) {
            return;
        }
        if (this._loadPromise) {
            return this._loadPromise;
        }
        this._loadPromise = this._loadCollections(false);
        await this._loadPromise;
    }

    /**
     * Starts a non-blocking background load when none is already running.
     */
    public startBackgroundLoad(): void {
        if (!this._loading) {
            this._loadPromise = this._loadCollections(false);
        }
    }

    /**
     * Clears in-memory and on-disk state, then reloads collections from the Galaxy API.
     */
    public async forceRefresh(): Promise<void> {
        log('GalaxyCollectionCache: Force refresh requested');
        this._loaded = false;
        this._loading = false;
        this._loadPromise = undefined;
        this._collections = [];
        this._loadPromise = this._loadCollections(true);
        await this._loadPromise;
    }

    /**
     * Attempts to hydrate collections from the persisted file cache.
     *
     * @returns True when a valid, non-expired cache file was loaded.
     */
    private _loadFromFileCache(): boolean {
        const cacheFile = this._cacheFilePath;
        if (!cacheFile) {
            log('GalaxyCollectionCache: No cache file path available');
            return false;
        }

        try {
            if (!fs.existsSync(cacheFile)) {
                log('GalaxyCollectionCache: Cache file does not exist');
                return false;
            }

            const data = fs.readFileSync(cacheFile, 'utf-8');
            const parsed: unknown = JSON.parse(data);

            if (!isCacheData(parsed)) {
                log('GalaxyCollectionCache: Invalid cache file format');
                return false;
            }

            const ageMs = Date.now() - parsed.timestamp;
            if (ageMs > CACHE_MAX_AGE_MS) {
                log(
                    `GalaxyCollectionCache: Cache is expired (${String(Math.floor(ageMs / (24 * 60 * 60 * 1000)))} days old)`,
                );
                return false;
            }

            this._collections = parsed.collections;
            this._cacheTimestamp = parsed.timestamp;
            this._loaded = true;
            log(
                `GalaxyCollectionCache: Loaded ${String(parsed.collections.length)} collections from file cache (${this.getCacheAge()})`,
            );
            return true;
        } catch (error) {
            log(
                `GalaxyCollectionCache: Failed to load from file cache: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    /**
     * Persists the in-memory collection list and timestamp to disk.
     */
    private _saveToFileCache(): void {
        const cacheFile = this._cacheFilePath;
        if (!cacheFile) {
            log('GalaxyCollectionCache: No cache file path available, cannot save');
            return;
        }

        try {
            // Ensure directory exists
            const cacheDir = path.dirname(cacheFile);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const cache: CacheData = {
                timestamp: Date.now(),
                collections: this._collections,
            };

            fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf-8');
            this._cacheTimestamp = cache.timestamp;
            log(
                `GalaxyCollectionCache: Saved ${String(this._collections.length)} collections to file cache`,
            );
        } catch (error) {
            log(
                `GalaxyCollectionCache: Failed to save to file cache: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Loads collections from file cache or the Galaxy API with progress events.
     *
     * @param forceRefresh - When true, bypasses file cache and refetches from the API.
     */
    private async _loadCollections(forceRefresh: boolean): Promise<void> {
        if (this._loading) {
            return;
        }

        // Try to load from file cache first (unless force refresh)
        if (!forceRefresh && !this._loaded) {
            const loadedFromCache = this._loadFromFileCache();
            if (loadedFromCache) {
                this._onDidLoad.fire();
                return;
            }
        }

        if (this._loaded && !forceRefresh) {
            return;
        }

        this._loading = true;
        log('GalaxyCollectionCache: Starting to fetch collections from Galaxy API...');

        // Show status bar
        if (this._statusBarItem) {
            this._statusBarItem.text = '$(sync~spin) Loading Galaxy collections...';
            this._statusBarItem.tooltip = 'Fetching Ansible collection list from Galaxy';
            this._statusBarItem.show();
        }

        try {
            const allCollections: GalaxyCollection[] = [];
            let nextUrl: string | null = 'https://galaxy.ansible.com/api/v3/collections/?limit=100';
            let pageCount = 0;
            const maxPages = 50; // Limit to 5000 collections max

            while (nextUrl && pageCount < maxPages) {
                const response = await this._fetchPage(nextUrl);

                // Get total count from first response
                if (pageCount === 0 && response.meta.count) {
                    this._totalCount = Math.min(response.meta.count, maxPages * 100);
                }

                for (const item of response.data) {
                    allCollections.push({
                        namespace: item.namespace,
                        name: item.name,
                        version: item.highest_version?.version ?? '',
                        deprecated: item.deprecated,
                        downloadCount: item.download_count ?? 0,
                    });
                }

                this._loadedCount = allCollections.length;

                // Handle next URL - could be relative or absolute
                if (response.links.next) {
                    nextUrl = response.links.next.startsWith('http')
                        ? response.links.next
                        : `https://galaxy.ansible.com${response.links.next}`;
                } else {
                    nextUrl = null;
                }
                pageCount++;

                // Update status bar with progress
                if (this._statusBarItem) {
                    this._statusBarItem.text = `$(sync~spin) Loading Galaxy collections... ${String(allCollections.length)} of ${String(this._totalCount)}`;
                }

                // Fire progress event
                this._onDidUpdateProgress.fire({
                    loaded: this._loadedCount,
                    total: this._totalCount,
                });
            }

            // Sort by download count (most popular first)
            allCollections.sort((a, b) => b.downloadCount - a.downloadCount);

            this._collections = allCollections;
            this._loaded = true;
            log(
                `GalaxyCollectionCache: Loaded ${String(allCollections.length)} collections from API`,
            );

            // Save to file cache
            this._saveToFileCache();

            // Update status bar to show completion briefly
            if (this._statusBarItem) {
                this._statusBarItem.text = `$(check) ${String(allCollections.length)} Galaxy collections loaded`;
                setTimeout(() => {
                    this._statusBarItem?.hide();
                }, 3000);
            }

            // Fire the load event
            this._onDidLoad.fire();
        } catch (error) {
            log(
                `GalaxyCollectionCache: Failed to load collections: ${error instanceof Error ? error.message : String(error)}`,
            );
            if (this._statusBarItem) {
                this._statusBarItem.text = '$(error) Failed to load Galaxy collections';
                setTimeout(() => {
                    this._statusBarItem?.hide();
                }, 5000);
            }

            // Show dismissable error message with details (only in extension mode)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (vscode) {
                vscode.window
                    .showErrorMessage(
                        `Failed to load Galaxy collections: ${errorMessage}`,
                        { modal: false },
                        'Retry',
                    )
                    .then((selection) => {
                        if (selection === 'Retry') {
                            this._loaded = false;
                            this._loading = false;
                            this._loadPromise = undefined;
                            this.startBackgroundLoad();
                        }
                    });
            } else {
                log(`Failed to load Galaxy collections: ${errorMessage}`);
            }
        } finally {
            this._loading = false;
        }
    }

    /**
     * Fetches a single paginated Galaxy API page with retry and redirect handling.
     *
     * @param url - Absolute Galaxy API URL to request.
     * @param retries - Number of attempts before failing the request.
     * @returns Parsed Galaxy API response for the requested page.
     */
    private _fetchPage(url: string, retries = 3): Promise<GalaxyApiResponse> {
        return new Promise((resolve, reject) => {
            const makeRequest = (attemptsLeft: number) => {
                log(
                    `GalaxyCollectionCache: Fetching ${url} (attempt ${String(retries - attemptsLeft + 1)}/${String(retries)})`,
                );

                const req = https.get(
                    url,
                    {
                        timeout: 30000, // 30 second timeout
                        headers: {
                            Accept: 'application/json',
                            'User-Agent': 'VSCode-Ansible-Environments/1.0',
                        },
                    },
                    (res) => {
                        log(
                            `GalaxyCollectionCache: Response status ${String(res.statusCode ?? 'unknown')} for ${url}`,
                        );

                        // Check for HTTP errors
                        if (res.statusCode && res.statusCode >= 400) {
                            if (attemptsLeft > 1) {
                                log(
                                    `GalaxyCollectionCache: HTTP ${String(res.statusCode)}, retrying... (${String(attemptsLeft - 1)} left)`,
                                );
                                setTimeout(() => {
                                    makeRequest(attemptsLeft - 1);
                                }, 1000);
                                return;
                            }
                            reject(
                                new Error(
                                    `HTTP ${String(res.statusCode)}: ${res.statusMessage ?? 'unknown'}`,
                                ),
                            );
                            return;
                        }

                        // Handle redirects
                        if (
                            res.statusCode === 301 ||
                            res.statusCode === 302 ||
                            res.statusCode === 307 ||
                            res.statusCode === 308
                        ) {
                            let redirectUrl = res.headers.location;
                            if (redirectUrl) {
                                // Handle relative URLs
                                if (redirectUrl.startsWith('/')) {
                                    redirectUrl = `https://galaxy.ansible.com${redirectUrl}`;
                                }
                                log(`GalaxyCollectionCache: Redirected to ${redirectUrl}`);
                                this._fetchPage(redirectUrl, attemptsLeft)
                                    .then(resolve)
                                    .catch(reject);
                                return;
                            }
                        }

                        const chunks: Buffer[] = [];
                        res.on('data', (chunk: Buffer) => chunks.push(chunk));
                        res.on('end', () => {
                            try {
                                const data = Buffer.concat(chunks).toString('utf-8');
                                log(`GalaxyCollectionCache: Received ${String(data.length)} bytes`);

                                if (!data || data.trim() === '') {
                                    log(`GalaxyCollectionCache: Empty response body`);
                                    if (attemptsLeft > 1) {
                                        log(
                                            `GalaxyCollectionCache: Retrying... (${String(attemptsLeft - 1)} left)`,
                                        );
                                        setTimeout(() => {
                                            makeRequest(attemptsLeft - 1);
                                        }, 1000);
                                        return;
                                    }
                                    reject(new Error('Empty response from server'));
                                    return;
                                }

                                const parsed = JSON.parse(data) as GalaxyApiResponse;
                                log(
                                    `GalaxyCollectionCache: Parsed response, got ${String(parsed.data.length)} items`,
                                );
                                resolve(parsed);
                            } catch (e) {
                                log(
                                    `GalaxyCollectionCache: Parse error: ${e instanceof Error ? e.message : String(e)}`,
                                );
                                if (attemptsLeft > 1) {
                                    log(
                                        `GalaxyCollectionCache: Retrying... (${String(attemptsLeft - 1)} left)`,
                                    );
                                    setTimeout(() => {
                                        makeRequest(attemptsLeft - 1);
                                    }, 1000);
                                } else {
                                    reject(
                                        new Error(
                                            `Failed to parse response: ${e instanceof Error ? e.message : String(e)}`,
                                        ),
                                    );
                                }
                            }
                        });

                        res.on('error', (err) => {
                            log(`GalaxyCollectionCache: Response stream error: ${err.message}`);
                            if (attemptsLeft > 1) {
                                setTimeout(() => {
                                    makeRequest(attemptsLeft - 1);
                                }, 1000);
                            } else {
                                reject(new Error(`Response error: ${err.message}`));
                            }
                        });
                    },
                );

                req.on('error', (err) => {
                    log(`GalaxyCollectionCache: Request error: ${err.message}`);
                    if (attemptsLeft > 1) {
                        log(
                            `GalaxyCollectionCache: Retrying... (${String(attemptsLeft - 1)} left)`,
                        );
                        setTimeout(() => {
                            makeRequest(attemptsLeft - 1);
                        }, 1000);
                    } else {
                        reject(new Error(`Network error: ${err.message}`));
                    }
                });

                req.on('timeout', () => {
                    log(`GalaxyCollectionCache: Request timeout`);
                    req.destroy();
                    if (attemptsLeft > 1) {
                        log(
                            `GalaxyCollectionCache: Retrying... (${String(attemptsLeft - 1)} left)`,
                        );
                        setTimeout(() => {
                            makeRequest(attemptsLeft - 1);
                        }, 1000);
                    } else {
                        reject(new Error('Request timed out after 30 seconds'));
                    }
                });
            };

            makeRequest(retries);
        });
    }

    /**
     * Returns the top N collections by download count.
     *
     * @param n - Maximum number of collections to return (default 50).
     * @returns Slice of the top collections sorted by popularity.
     */
    public getTopCollections(n = 50): GalaxyCollection[] {
        return this._collections.slice(0, n);
    }

    /**
     * Searches cached collections by namespace, name, or FQCN.
     *
     * @param query - Case-insensitive search string; empty returns top 100 by popularity.
     * @returns Up to 100 matching collections from the in-memory cache.
     */
    public search(query: string): GalaxyCollection[] {
        if (!query) {
            // Return top 100 by popularity
            return this._collections.slice(0, 100);
        }

        const lowerQuery = query.toLowerCase();
        return this._collections
            .filter(
                (c) =>
                    c.name.toLowerCase().includes(lowerQuery) ||
                    c.namespace.toLowerCase().includes(lowerQuery) ||
                    `${c.namespace}.${c.name}`.toLowerCase().includes(lowerQuery),
            )
            .slice(0, 100);
    }
}
