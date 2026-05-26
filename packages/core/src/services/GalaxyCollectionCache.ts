// Try to import vscode - will fail in standalone MCP mode
let vscode: typeof import('vscode') | undefined;
try {
    vscode = require('vscode');
} catch {
    // Running in standalone mode (MCP server)
    vscode = undefined;
}

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { log } from '../utils/logging';
import { SimpleEventEmitter } from '../utils/SimpleEventEmitter';

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
    data: Array<{
        namespace: string;
        name: string;
        deprecated: boolean;
        download_count: number;
        highest_version: { version: string };
    }>;
}

const CACHE_FILE_NAME = 'galaxy-collections-cache.json';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export class GalaxyCollectionCache {
    private static _instance: GalaxyCollectionCache | undefined;
    private _collections: GalaxyCollection[] = [];
    private _loading: boolean = false;
    private _loaded: boolean = false;
    private _loadPromise: Promise<void> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VS Code StatusBarItem (conditional import)
    private _statusBarItem: any | undefined;
    private _onDidLoad = vscode ? new vscode.EventEmitter<void>() : new SimpleEventEmitter<void>();
    public readonly onDidLoad = this._onDidLoad.event;
    private _totalCount: number = 0;
    private _loadedCount: number = 0;
    private _onDidUpdateProgress = vscode 
        ? new vscode.EventEmitter<{ loaded: number; total: number }>() 
        : new SimpleEventEmitter<{ loaded: number; total: number }>();
    public readonly onDidUpdateProgress = this._onDidUpdateProgress.event;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VS Code ExtensionContext (conditional import)
    private _extensionContext: any | undefined;
    private _cacheTimestamp: number = 0;
    private _standaloneMode: boolean = !vscode;

    private constructor() {
        if (vscode) {
            this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VS Code ExtensionContext (conditional import)
    public setExtensionContext(context: any): void {
        this._extensionContext = context;
    }

    private get _cacheFilePath(): string | undefined {
        // In extension mode, use extension context's global storage
        if (this._extensionContext) {
            return path.join(this._extensionContext.globalStorageUri.fsPath, CACHE_FILE_NAME);
        }
        
        // In standalone mode, use ~/.vscode/extensions/cidrblock.ansible-environments/ or fallback
        if (this._standaloneMode) {
            // Try to find the extension's global storage in standard locations
            const vscodeDir = path.join(os.homedir(), '.vscode', 'extensions', 'cidrblock.ansible-environments-0.0.1');
            const cursorDir = path.join(os.homedir(), '.cursor', 'extensions', 'cidrblock.ansible-environments-0.0.1');
            
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

    public getProgress(): { loaded: number; total: number } {
        return { loaded: this._loadedCount, total: this._totalCount };
    }

    public static getInstance(): GalaxyCollectionCache {
        if (!GalaxyCollectionCache._instance) {
            GalaxyCollectionCache._instance = new GalaxyCollectionCache();
        }
        return GalaxyCollectionCache._instance;
    }

    public isLoaded(): boolean {
        return this._loaded;
    }

    public isLoading(): boolean {
        return this._loading;
    }

    public getCollections(): GalaxyCollection[] {
        return this._collections;
    }

    public getCacheAge(): string {
        if (this._cacheTimestamp === 0) {
            return 'never';
        }
        const ageMs = Date.now() - this._cacheTimestamp;
        const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        
        if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
            return 'just now';
        }
    }

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

    public startBackgroundLoad(): void {
        if (!this._loading) {
            this._loadPromise = this._loadCollections(false);
        }
    }

    public async forceRefresh(): Promise<void> {
        log('GalaxyCollectionCache: Force refresh requested');
        this._loaded = false;
        this._loading = false;
        this._loadPromise = undefined;
        this._collections = [];
        this._loadPromise = this._loadCollections(true);
        await this._loadPromise;
    }

    private async _loadFromFileCache(): Promise<boolean> {
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
            const cache: CacheData = JSON.parse(data);

            if (!cache.timestamp || !cache.collections || !Array.isArray(cache.collections)) {
                log('GalaxyCollectionCache: Invalid cache file format');
                return false;
            }

            const ageMs = Date.now() - cache.timestamp;
            if (ageMs > CACHE_MAX_AGE_MS) {
                log(`GalaxyCollectionCache: Cache is expired (${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days old)`);
                return false;
            }

            this._collections = cache.collections;
            this._cacheTimestamp = cache.timestamp;
            this._loaded = true;
            log(`GalaxyCollectionCache: Loaded ${cache.collections.length} collections from file cache (${this.getCacheAge()})`);
            return true;
        } catch (error) {
            log(`GalaxyCollectionCache: Failed to load from file cache: ${error}`);
            return false;
        }
    }

    private async _saveToFileCache(): Promise<void> {
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
                collections: this._collections
            };

            fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf-8');
            this._cacheTimestamp = cache.timestamp;
            log(`GalaxyCollectionCache: Saved ${this._collections.length} collections to file cache`);
        } catch (error) {
            log(`GalaxyCollectionCache: Failed to save to file cache: ${error}`);
        }
    }

    private async _loadCollections(forceRefresh: boolean): Promise<void> {
        if (this._loading) {
            return;
        }

        // Try to load from file cache first (unless force refresh)
        if (!forceRefresh && !this._loaded) {
            const loadedFromCache = await this._loadFromFileCache();
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
                if (pageCount === 0 && response.meta?.count) {
                    this._totalCount = Math.min(response.meta.count, maxPages * 100);
                }
                
                for (const item of response.data) {
                    allCollections.push({
                        namespace: item.namespace,
                        name: item.name,
                        version: item.highest_version?.version || '',
                        deprecated: item.deprecated,
                        downloadCount: item.download_count || 0
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
                    this._statusBarItem.text = `$(sync~spin) Loading Galaxy collections... ${allCollections.length} of ${this._totalCount}`;
                }
                
                // Fire progress event
                this._onDidUpdateProgress.fire({ loaded: this._loadedCount, total: this._totalCount });
            }

            // Sort by download count (most popular first)
            allCollections.sort((a, b) => b.downloadCount - a.downloadCount);

            this._collections = allCollections;
            this._loaded = true;
            log(`GalaxyCollectionCache: Loaded ${allCollections.length} collections from API`);

            // Save to file cache
            await this._saveToFileCache();

            // Update status bar to show completion briefly
            if (this._statusBarItem) {
                this._statusBarItem.text = `$(check) ${allCollections.length} Galaxy collections loaded`;
                setTimeout(() => {
                    this._statusBarItem?.hide();
                }, 3000);
            }

            // Fire the load event
            this._onDidLoad.fire();
        } catch (error) {
            log(`GalaxyCollectionCache: Failed to load collections: ${error}`);
            if (this._statusBarItem) {
                this._statusBarItem.text = '$(error) Failed to load Galaxy collections';
                setTimeout(() => {
                    this._statusBarItem?.hide();
                }, 5000);
            }
            
            // Show dismissable error message with details (only in extension mode)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (vscode) {
                vscode.window.showErrorMessage(
                    `Failed to load Galaxy collections: ${errorMessage}`,
                    { modal: false },
                    'Retry'
                ).then(selection => {
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

    private _fetchPage(url: string, retries: number = 3): Promise<GalaxyApiResponse> {
        return new Promise((resolve, reject) => {
            const makeRequest = (attemptsLeft: number) => {
                log(`GalaxyCollectionCache: Fetching ${url} (attempt ${retries - attemptsLeft + 1}/${retries})`);
                
                const req = https.get(url, {
                    timeout: 30000, // 30 second timeout
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'VSCode-Ansible-Environments/1.0'
                    }
                }, (res) => {
                    log(`GalaxyCollectionCache: Response status ${res.statusCode} for ${url}`);
                    
                    // Check for HTTP errors
                    if (res.statusCode && res.statusCode >= 400) {
                        if (attemptsLeft > 1) {
                            log(`GalaxyCollectionCache: HTTP ${res.statusCode}, retrying... (${attemptsLeft - 1} left)`);
                            setTimeout(() => makeRequest(attemptsLeft - 1), 1000);
                            return;
                        }
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        return;
                    }

                    // Handle redirects
                    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                        let redirectUrl = res.headers.location;
                        if (redirectUrl) {
                            // Handle relative URLs
                            if (redirectUrl.startsWith('/')) {
                                redirectUrl = `https://galaxy.ansible.com${redirectUrl}`;
                            }
                            log(`GalaxyCollectionCache: Redirected to ${redirectUrl}`);
                            this._fetchPage(redirectUrl, attemptsLeft).then(resolve).catch(reject);
                            return;
                        }
                    }

                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => {
                        try {
                            const data = Buffer.concat(chunks).toString('utf-8');
                            log(`GalaxyCollectionCache: Received ${data.length} bytes`);
                            
                            if (!data || data.trim() === '') {
                                log(`GalaxyCollectionCache: Empty response body`);
                                if (attemptsLeft > 1) {
                                    log(`GalaxyCollectionCache: Retrying... (${attemptsLeft - 1} left)`);
                                    setTimeout(() => makeRequest(attemptsLeft - 1), 1000);
                                    return;
                                }
                                reject(new Error('Empty response from server'));
                                return;
                            }
                            
                            const parsed = JSON.parse(data);
                            log(`GalaxyCollectionCache: Parsed response, got ${parsed.data?.length || 0} items`);
                            resolve(parsed);
                        } catch (e) {
                            log(`GalaxyCollectionCache: Parse error: ${e instanceof Error ? e.message : e}`);
                            if (attemptsLeft > 1) {
                                log(`GalaxyCollectionCache: Retrying... (${attemptsLeft - 1} left)`);
                                setTimeout(() => makeRequest(attemptsLeft - 1), 1000);
                            } else {
                                reject(new Error(`Failed to parse response: ${e instanceof Error ? e.message : e}`));
                            }
                        }
                    });
                    
                    res.on('error', (err) => {
                        log(`GalaxyCollectionCache: Response stream error: ${err.message}`);
                        if (attemptsLeft > 1) {
                            setTimeout(() => makeRequest(attemptsLeft - 1), 1000);
                        } else {
                            reject(new Error(`Response error: ${err.message}`));
                        }
                    });
                });

                req.on('error', (err) => {
                    log(`GalaxyCollectionCache: Request error: ${err.message}`);
                    if (attemptsLeft > 1) {
                        log(`GalaxyCollectionCache: Retrying... (${attemptsLeft - 1} left)`);
                        setTimeout(() => makeRequest(attemptsLeft - 1), 1000);
                    } else {
                        reject(new Error(`Network error: ${err.message}`));
                    }
                });

                req.on('timeout', () => {
                    log(`GalaxyCollectionCache: Request timeout`);
                    req.destroy();
                    if (attemptsLeft > 1) {
                        log(`GalaxyCollectionCache: Retrying... (${attemptsLeft - 1} left)`);
                        setTimeout(() => makeRequest(attemptsLeft - 1), 1000);
                    } else {
                        reject(new Error('Request timed out after 30 seconds'));
                    }
                });
            };

            makeRequest(retries);
        });
    }

    public search(query: string): GalaxyCollection[] {
        if (!query) {
            // Return top 100 by popularity
            return this._collections.slice(0, 100);
        }

        const lowerQuery = query.toLowerCase();
        return this._collections
            .filter(c => 
                c.name.toLowerCase().includes(lowerQuery) ||
                c.namespace.toLowerCase().includes(lowerQuery) ||
                `${c.namespace}.${c.name}`.toLowerCase().includes(lowerQuery)
            )
            .slice(0, 100);
    }
}
