import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { log } from '@ansible/common';
import type {
    PluginInfo,
    PluginData,
    PluginDoc,
    PluginOption,
    PluginReturn,
} from '@ansible/common';

const CACHE_DIR_NAME = 'galaxy-docs';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DOCS_BLOB_BASE =
    'https://galaxy.ansible.com/api/v3/plugin/ansible/content/published/collections/index';

interface GalaxyOptionEntry {
    name: string;
    description?: string | string[];
    type?: string;
    default?: unknown;
    choices?: string[];
    required?: boolean;
    elements?: string;
    aliases?: string[];
    suboptions?: GalaxyOptionEntry[] | Record<string, unknown>;
    version_added?: string;
}

interface GalaxyReturnEntry {
    name: string;
    description?: string | string[];
    returned?: string;
    type?: string;
    sample?: unknown;
    contains?: unknown;
}

interface DocsBlobContent {
    content_name: string;
    content_type: string;
    doc_strings?: {
        doc?: Record<string, unknown>;
        examples?: string;
        return?: GalaxyReturnEntry[] | Record<string, unknown>;
        metadata?: unknown;
    };
}

/**
 * Galaxy returns options/suboptions as arrays with a `name` field.
 * Normalize to the Record<string, PluginOption> format used internally.
 * @param raw - Raw options from the Galaxy API (array or record shape).
 * @returns Keyed record of plugin options, or undefined if input is falsy.
 */
function normalizeOptions(
    raw: GalaxyOptionEntry[] | Record<string, unknown> | undefined,
): Record<string, PluginOption> | undefined {
    if (!raw) return undefined;

    if (Array.isArray(raw)) {
        const result: Record<string, PluginOption> = {};
        for (const entry of raw) {
            const { name, suboptions, ...rest } = entry;
            if (!name) continue;
            const opt: PluginOption = { ...rest };
            if (suboptions) {
                opt.suboptions = normalizeOptions(suboptions as GalaxyOptionEntry[]);
            }
            result[name] = opt;
        }
        return result;
    }

    return raw as Record<string, PluginOption>;
}

/**
 * Galaxy returns return values as an array with a `name` field.
 * Normalize to Record format.
 * @param raw - Raw return values from the Galaxy API.
 * @returns Keyed record of return values, or undefined if input is falsy.
 */
function normalizeReturn(
    raw: GalaxyReturnEntry[] | Record<string, unknown> | undefined,
): PluginReturn | undefined {
    if (!raw) return undefined;

    if (Array.isArray(raw)) {
        const result: PluginReturn = {};
        for (const entry of raw) {
            const { name, contains, ...rest } = entry;
            if (!name) continue;
            result[name] = {
                ...rest,
                contains: contains as Record<string, unknown> | undefined,
            };
        }
        return result;
    }

    return raw as PluginReturn;
}

/**
 * Normalize the raw Galaxy doc object into our PluginDoc format,
 * converting array-shaped options to keyed Records.
 * @param raw - Raw doc object from the Galaxy API.
 * @returns Normalized PluginDoc, or undefined if input is falsy.
 */
function normalizeDoc(raw: Record<string, unknown> | undefined): PluginDoc | undefined {
    if (!raw) return undefined;
    const doc = { ...raw } as Record<string, unknown>;
    if (doc.options) {
        doc.options = normalizeOptions(doc.options as GalaxyOptionEntry[]);
    }
    return doc as unknown as PluginDoc;
}

interface DocsBlobResponse {
    docs_blob: {
        contents: DocsBlobContent[];
        collection_readme?: { name: string; html: string };
    };
}

const CACHE_FORMAT_VERSION = 2;

interface CachedDocsBlob {
    formatVersion?: number;
    timestamp: number;
    namespace: string;
    name: string;
    version: string;
    plugins: Record<string, PluginInfo[]>;
    pluginDocs: Record<string, PluginData>;
}

interface ExtensionContextLike {
    globalStorageUri: { fsPath: string };
}

/**
 * Fetches and caches Galaxy docs-blob data for browsing plugin documentation
 * without installing collections.
 */
export class GalaxyDocsCache {
    private static _instance: GalaxyDocsCache | undefined;
    private _extensionContext: ExtensionContextLike | undefined;
    private _memoryCache = new Map<string, CachedDocsBlob>();
    private _pendingFetches = new Map<string, Promise<CachedDocsBlob | null>>();

    /** Returns the singleton instance. */
    public static getInstance(): GalaxyDocsCache {
        GalaxyDocsCache._instance ??= new GalaxyDocsCache();
        return GalaxyDocsCache._instance;
    }

    /**
     * Store the VS Code extension context for cache path resolution.
     * @param context - Extension context providing globalStorageUri.
     */
    public setExtensionContext(context: ExtensionContextLike): void {
        this._extensionContext = context;
    }

    /** Resolves the on-disk cache directory, creating it if needed. */
    private get _cacheDir(): string | undefined {
        if (this._extensionContext) {
            return path.join(this._extensionContext.globalStorageUri.fsPath, CACHE_DIR_NAME);
        }
        const fallback = path.join(os.homedir(), '.ansible-environments', CACHE_DIR_NAME);
        if (!fs.existsSync(fallback)) {
            fs.mkdirSync(fallback, { recursive: true });
        }
        return fallback;
    }

    /** Builds a cache key from namespace, name, and version. */
    private _cacheKey(namespace: string, name: string, version: string): string {
        return `${namespace}.${name}-${version}`;
    }

    /** Resolves the file path for a cached docs-blob entry. */
    private _cacheFilePath(namespace: string, name: string, version: string): string | undefined {
        const dir = this._cacheDir;
        if (!dir) return undefined;
        return path.join(dir, `${this._cacheKey(namespace, name, version)}.json`);
    }

    /**
     * Get plugin types and their plugins for a collection. Fetches from API if not cached.
     * @param namespace - Collection namespace (e.g. "cisco").
     * @param name - Collection name (e.g. "ios").
     * @param version - Collection version string.
     * @returns Map of plugin type to plugin info array, or null on failure.
     */
    public async getPluginTypes(
        namespace: string,
        name: string,
        version: string,
    ): Promise<Record<string, PluginInfo[]> | null> {
        const cached = await this._getOrFetch(namespace, name, version);
        return cached?.plugins ?? null;
    }

    /**
     * Get full documentation for a specific plugin from a Galaxy collection.
     * @param namespace - Collection namespace.
     * @param name - Collection name.
     * @param version - Collection version.
     * @param pluginFqcn - Fully qualified plugin name.
     * @param pluginType - Plugin type (module, lookup, etc.).
     * @returns Plugin documentation data, or null if not found.
     */
    public async getPluginDoc(
        namespace: string,
        name: string,
        version: string,
        pluginFqcn: string,
        pluginType: string,
    ): Promise<PluginData | null> {
        const cached = await this._getOrFetch(namespace, name, version);
        if (!cached) return null;
        return cached.pluginDocs[`${pluginFqcn}:${pluginType}`] ?? null;
    }

    /**
     * Check whether docs for a collection are already cached (memory or disk).
     * @param namespace - Collection namespace.
     * @param name - Collection name.
     * @param version - Collection version.
     * @returns True if docs are available without an API call.
     */
    public isCached(namespace: string, name: string, version: string): boolean {
        const key = this._cacheKey(namespace, name, version);
        if (this._memoryCache.has(key)) return true;
        const filePath = this._cacheFilePath(namespace, name, version);
        return filePath != null && fs.existsSync(filePath);
    }

    /** Retrieves from memory, disk, or fetches from the Galaxy API. */
    private async _getOrFetch(
        namespace: string,
        name: string,
        version: string,
    ): Promise<CachedDocsBlob | null> {
        const key = this._cacheKey(namespace, name, version);

        const mem = this._memoryCache.get(key);
        if (mem) return mem;

        const fromDisk = this._loadFromDisk(namespace, name, version);
        if (fromDisk) {
            this._memoryCache.set(key, fromDisk);
            return fromDisk;
        }

        const pending = this._pendingFetches.get(key);
        if (pending) return pending;

        const fetchPromise = this._fetchAndCache(namespace, name, version);
        this._pendingFetches.set(key, fetchPromise);
        try {
            return await fetchPromise;
        } finally {
            this._pendingFetches.delete(key);
        }
    }

    /** Attempts to load a cached docs-blob from disk. */
    private _loadFromDisk(
        namespace: string,
        name: string,
        version: string,
    ): CachedDocsBlob | null {
        const filePath = this._cacheFilePath(namespace, name, version);
        if (!filePath || !fs.existsSync(filePath)) return null;

        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw) as CachedDocsBlob;
            if ((parsed.formatVersion ?? 0) < CACHE_FORMAT_VERSION) {
                log(
                    `GalaxyDocsCache: Stale format for ${namespace}.${name} ${version}, refetching`,
                );
                return null;
            }
            if (Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) {
                log(`GalaxyDocsCache: Expired cache for ${namespace}.${name} ${version}`);
                return null;
            }
            log(`GalaxyDocsCache: Loaded ${namespace}.${name} ${version} from disk`);
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * Fetches docs-blob from the Galaxy API and caches the result.
     * @returns The cached blob, or null on failure.
     */
    private async _fetchAndCache(
        namespace: string,
        name: string,
        version: string,
    ): Promise<CachedDocsBlob | null> {
        const url = `${DOCS_BLOB_BASE}/${namespace}/${name}/versions/${version}/docs-blob/`;
        log(`GalaxyDocsCache: Fetching docs-blob for ${namespace}.${name} ${version}`);

        try {
            const raw = await this._httpsGet(url);
            const response = JSON.parse(raw) as DocsBlobResponse;
            const blob = response.docs_blob;

            if (!blob.contents) {
                log(`GalaxyDocsCache: No contents in docs-blob for ${namespace}.${name}`);
                return null;
            }

            const plugins: Record<string, PluginInfo[]> = {};
            const pluginDocs: Record<string, PluginData> = {};
            const fqcnPrefix = `${namespace}.${name}`;

            for (const item of blob.contents) {
                const contentType = item.content_type;
                if (
                    !contentType ||
                    contentType === 'module_utils' ||
                    contentType === 'doc_fragment'
                ) {
                    continue;
                }

                const pluginName = item.content_name;
                const fqcn = `${fqcnPrefix}.${pluginName}`;
                const ds = item.doc_strings;
                const doc = ds?.doc;
                const shortDesc = (doc?.short_description as string | undefined) ?? '';

                plugins[contentType] ??= [];
                plugins[contentType].push({
                    name: pluginName,
                    fullName: fqcn,
                    shortDescription: shortDesc,
                });

                if (ds) {
                    pluginDocs[`${fqcn}:${contentType}`] = {
                        doc: normalizeDoc(ds.doc),
                        examples: ds.examples,
                        return: normalizeReturn(ds.return),
                        metadata: ds.metadata,
                    };
                }
            }

            for (const type of Object.keys(plugins)) {
                plugins[type].sort((a, b) => a.name.localeCompare(b.name));
            }

            const cached: CachedDocsBlob = {
                formatVersion: CACHE_FORMAT_VERSION,
                timestamp: Date.now(),
                namespace,
                name,
                version,
                plugins,
                pluginDocs,
            };

            this._memoryCache.set(this._cacheKey(namespace, name, version), cached);
            this._saveToDisk(cached);

            const totalPlugins = Object.values(plugins).reduce((s, arr) => s + arr.length, 0);
            log(
                `GalaxyDocsCache: Cached ${String(totalPlugins)} plugins for ${namespace}.${name} ${version}`,
            );

            return cached;
        } catch (error) {
            log(
                `GalaxyDocsCache: Failed to fetch docs-blob for ${namespace}.${name}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    /**
     * Persists a cached docs-blob entry to disk.
     * @param cached - The docs-blob entry to write.
     */
    private _saveToDisk(cached: CachedDocsBlob): void {
        const filePath = this._cacheFilePath(cached.namespace, cached.name, cached.version);
        if (!filePath) return;

        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(cached), 'utf-8');
        } catch (error) {
            log(
                `GalaxyDocsCache: Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private static readonly ALLOWED_REDIRECT_HOSTS = new Set([
        'galaxy.ansible.com',
        'old-galaxy.ansible.com',
        'console.redhat.com',
    ]);

    private static readonly MAX_REDIRECTS = 5;

    /**
     * Performs an HTTPS GET request with retry logic and redirect following.
     * Validates redirect targets against an allowlist to prevent SSRF.
     * Uses exponential backoff with jitter between retries.
     * @param url - The URL to fetch.
     * @param retries - Number of retry attempts remaining.
     * @param redirectsLeft - Remaining redirect hops before aborting.
     * @returns The response body as a string.
     */
    private _httpsGet(
        url: string,
        retries = 3,
        redirectsLeft = GalaxyDocsCache.MAX_REDIRECTS,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const attempt = (left: number) => {
                const req = https.get(
                    url,
                    {
                        timeout: 60000,
                        headers: {
                            Accept: 'application/json',
                            'User-Agent': 'VSCode-Ansible-Environments/1.0',
                        },
                    },
                    (res) => {
                        if (
                            res.statusCode &&
                            (res.statusCode === 301 ||
                                res.statusCode === 302 ||
                                res.statusCode === 307)
                        ) {
                            res.resume();
                            if (redirectsLeft <= 0) {
                                reject(new Error('Too many redirects'));
                                return;
                            }
                            let loc = res.headers.location;
                            if (loc?.startsWith('/')) {
                                loc = `https://galaxy.ansible.com${loc}`;
                            }
                            if (loc) {
                                try {
                                    const target = new URL(loc);
                                    if (
                                        !GalaxyDocsCache.ALLOWED_REDIRECT_HOSTS.has(target.hostname)
                                    ) {
                                        reject(
                                            new Error(
                                                `Redirect to disallowed host: ${target.hostname}`,
                                            ),
                                        );
                                        return;
                                    }
                                } catch {
                                    reject(new Error(`Invalid redirect URL: ${loc}`));
                                    return;
                                }
                                this._httpsGet(loc, left, redirectsLeft - 1)
                                    .then(resolve)
                                    .catch(reject);
                                return;
                            }
                        }

                        if (res.statusCode && res.statusCode >= 400) {
                            res.resume();
                            if (left > 1) {
                                const delay = GalaxyDocsCache._retryDelay(retries - left);
                                setTimeout(() => {
                                    attempt(left - 1);
                                }, delay);
                                return;
                            }
                            reject(new Error(`HTTP ${String(res.statusCode)}`));
                            return;
                        }

                        const chunks: Buffer[] = [];
                        res.on('data', (c: Buffer) => {
                            chunks.push(c);
                        });
                        res.on('end', () => {
                            resolve(Buffer.concat(chunks).toString('utf-8'));
                        });
                        res.on('error', (e) => {
                            if (left > 1) {
                                const delay = GalaxyDocsCache._retryDelay(retries - left);
                                setTimeout(() => {
                                    attempt(left - 1);
                                }, delay);
                            } else {
                                reject(e);
                            }
                        });
                    },
                );
                req.on('error', (e) => {
                    if (left > 1) {
                        const delay = GalaxyDocsCache._retryDelay(retries - left);
                        setTimeout(() => {
                            attempt(left - 1);
                        }, delay);
                    } else {
                        reject(e);
                    }
                });
                req.on('timeout', () => {
                    req.destroy();
                    if (left > 1) {
                        const delay = GalaxyDocsCache._retryDelay(retries - left);
                        setTimeout(() => {
                            attempt(left - 1);
                        }, delay);
                    } else {
                        reject(new Error('Timeout'));
                    }
                });
            };
            attempt(retries);
        });
    }

    /**
     * Exponential backoff with jitter: base * 2^attempt + random jitter.
     * @param attempt - Zero-based retry attempt index.
     * @returns Delay in milliseconds before the next retry.
     */
    private static _retryDelay(attempt: number): number {
        const base = 1000;
        const exp = base * Math.pow(2, attempt);
        const jitter = Math.random() * base;
        return exp + jitter;
    }
}
