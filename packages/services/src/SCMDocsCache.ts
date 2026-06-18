import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';

import { parseMetadataDump, extractMetadataJson } from '@ansible/common';
import type { PluginInfo, PluginData } from '@ansible/common';
import { getCommandService } from './CommandService';

// Conditional vscode import for authentication
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone
}

const CACHE_DIR_NAME = 'scm-docs';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_FORMAT_VERSION = 1;

/** Cached plugin documentation for an SCM collection. */
interface CachedSCMDocsBlob {
    formatVersion: number;
    timestamp: number;
    org: string;
    repo: string;
    namespace: string;
    name: string;
    sha: string;
    plugins: Record<string, PluginInfo[]>;
    pluginDocs: Record<string, PluginData>;
}

/**
 * Fetches plugin documentation for GitHub-hosted Ansible collections by
 * shallow-cloning the repository and running `ansible-doc --metadata-dump`.
 * Results are cached to disk with SHA-based invalidation and a 7-day TTL.
 */
export class SCMDocsCache {
    private static _instance: SCMDocsCache | undefined;
    private _memoryCache = new Map<string, CachedSCMDocsBlob>();
    private _pendingFetches = new Map<string, Promise<CachedSCMDocsBlob | null>>();
    private _failureTimes = new Map<string, number>();
    private _log: (msg: string) => void = console.log;

    /**
     * Returns the singleton instance.
     *
     * @returns The shared SCMDocsCache instance.
     */
    public static getInstance(): SCMDocsCache {
        SCMDocsCache._instance ??= new SCMDocsCache();
        return SCMDocsCache._instance;
    }

    /**
     * Replaces the singleton — used only by tests.
     *
     * @param instance - The mock or test instance to set.
     */
    public static _setInstance(instance: SCMDocsCache | undefined): void {
        SCMDocsCache._instance = instance;
    }

    /**
     * Sets the logging callback used for cache diagnostics.
     *
     * @param logFn - Function invoked with formatted log messages.
     */
    public setLogFunction(logFn: (msg: string) => void): void {
        this._log = logFn;
    }

    /**
     * Returns the on-disk cache directory, creating it if needed.
     *
     * @returns Absolute path to the SCM docs cache directory.
     */
    private _getCacheDir(): string {
        const dir = path.join(os.homedir(), '.cache', 'ansible-environments', CACHE_DIR_NAME);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Builds the cache file name from org, repo, and commit SHA.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @param sha - Commit SHA for cache invalidation.
     * @returns Cache filename.
     */
    private _cacheFileName(org: string, repo: string, sha: string): string {
        return `${org}__${repo}-${sha.substring(0, 7)}.json`;
    }

    /**
     * Builds the memory cache key from org and repo.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @returns Memory cache key.
     */
    private _cacheKey(org: string, repo: string): string {
        return `${org}/${repo}`;
    }

    /**
     * Get plugin types and their plugins for an SCM collection.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @param namespace - Ansible collection namespace.
     * @param name - Ansible collection name.
     * @returns Map of plugin type to plugin info array, or null on failure.
     */
    public async getPluginTypes(
        org: string,
        repo: string,
        namespace: string,
        name: string,
    ): Promise<Record<string, PluginInfo[]> | null> {
        const cached = await this._getOrFetch(org, repo, namespace, name);
        return cached?.plugins ?? null;
    }

    /**
     * Get full documentation for a specific plugin from an SCM collection.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @param namespace - Ansible collection namespace.
     * @param name - Ansible collection name.
     * @param pluginFqcn - Fully qualified plugin name.
     * @param pluginType - Plugin type (module, lookup, etc.).
     * @returns Plugin documentation data, or null if not found.
     */
    public async getPluginDoc(
        org: string,
        repo: string,
        namespace: string,
        name: string,
        pluginFqcn: string,
        pluginType: string,
    ): Promise<PluginData | null> {
        const cached = await this._getOrFetch(org, repo, namespace, name);
        if (!cached) return null;
        return cached.pluginDocs[`${pluginFqcn}:${pluginType}`] ?? null;
    }

    /**
     * Evicts cached data for a specific collection to force a refetch.
     * Removes both the in-memory entry and any on-disk cache files.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     */
    public invalidate(org: string, repo: string): void {
        const key = this._cacheKey(org, repo);
        this._memoryCache.delete(key);
        this._failureTimes.delete(key);

        try {
            const cacheDir = this._getCacheDir();
            const prefix = `${org}__${repo}-`;
            const files = fs.readdirSync(cacheDir).filter((f) => f.startsWith(prefix));
            for (const f of files) {
                fs.unlinkSync(path.join(cacheDir, f));
            }
        } catch {
            // Cache dir may not exist yet
        }

        this._log(`SCMDocsCache: Invalidated ${key}`);
    }

    /**
     * Retrieves from memory, disk, or fetches via shallow clone.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @param namespace - Ansible collection namespace.
     * @param name - Ansible collection name.
     * @returns Cached docs blob, or null on failure.
     */
    private async _getOrFetch(
        org: string,
        repo: string,
        namespace: string,
        name: string,
    ): Promise<CachedSCMDocsBlob | null> {
        const key = this._cacheKey(org, repo);

        const mem = this._memoryCache.get(key);
        if (mem && !this._isExpired(mem)) {
            return mem;
        }

        const fromDisk = this._loadFromDisk(org, repo);
        if (fromDisk) {
            this._memoryCache.set(key, fromDisk);
            return fromDisk;
        }

        // Failure cooldown: skip re-clone for 5 minutes after a failure
        const lastFailure = this._failureTimes.get(key);
        if (lastFailure && Date.now() - lastFailure < FAILURE_COOLDOWN_MS) {
            this._log(`SCMDocsCache: skipping ${key} — in failure cooldown`);
            return null;
        }

        const pending = this._pendingFetches.get(key);
        if (pending) return pending;

        const fetchPromise = this._cloneAndIndex(org, repo, namespace, name).then(
            (result) => {
                if (!result) {
                    this._failureTimes.set(key, Date.now());
                }
                return result;
            },
            (err: unknown) => {
                this._failureTimes.set(key, Date.now());
                throw err;
            },
        );
        this._pendingFetches.set(key, fetchPromise);
        try {
            return await fetchPromise;
        } finally {
            this._pendingFetches.delete(key);
        }
    }

    /**
     * Checks whether a cached entry has exceeded the TTL.
     *
     * @param cached - The cache entry to check.
     * @returns True if the entry is older than the max age.
     */
    private _isExpired(cached: CachedSCMDocsBlob): boolean {
        return Date.now() - cached.timestamp > CACHE_MAX_AGE_MS;
    }

    /**
     * Attempts to load a cached docs-blob from disk.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @returns Cached blob if valid, or null.
     */
    private _loadFromDisk(org: string, repo: string): CachedSCMDocsBlob | null {
        const cacheDir = this._getCacheDir();
        const prefix = `${org}__${repo}-`;

        try {
            const files = fs
                .readdirSync(cacheDir)
                .filter((f) => f.startsWith(prefix))
                .sort();
            if (files.length === 0) return null;

            const filePath = path.join(cacheDir, files[files.length - 1]);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw) as CachedSCMDocsBlob;

            if (parsed.formatVersion < CACHE_FORMAT_VERSION) {
                this._log(`SCMDocsCache: Stale format for ${org}/${repo}, will refetch`);
                return null;
            }

            if (this._isExpired(parsed)) {
                this._log(`SCMDocsCache: Expired cache for ${org}/${repo}`);
                return null;
            }

            this._log(
                `SCMDocsCache: Loaded ${org}/${repo} from disk (SHA: ${parsed.sha.substring(0, 7)})`,
            );
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * Shallow-clones the repo, runs ansible-doc, parses and caches the result.
     *
     * @param org - GitHub organization.
     * @param repo - Repository name.
     * @param namespace - Ansible collection namespace.
     * @param name - Ansible collection name.
     * @returns The cached blob, or null on failure.
     */
    private async _cloneAndIndex(
        org: string,
        repo: string,
        namespace: string,
        name: string,
    ): Promise<CachedSCMDocsBlob | null> {
        const key = this._cacheKey(org, repo);
        this._log(`SCMDocsCache: Indexing ${key}...`);

        const tmpBase = path.join(
            os.tmpdir(),
            `ansible-scm-docs-${crypto.randomBytes(4).toString('hex')}`,
        );
        const collectionsPath = path.join(tmpBase, 'ansible_collections', namespace, name);
        const collectionsParent = path.dirname(collectionsPath);

        try {
            fs.mkdirSync(collectionsParent, { recursive: true });

            const cloneUrl = `https://github.com/${org}/${repo}.git`;
            const token = await this._getGitHubToken();

            // Clone env: use GIT_ASKPASS to supply token without embedding in URL
            const cloneEnv: NodeJS.ProcessEnv = { ...process.env };
            if (token) {
                const askPass = this._writeAskPassScript(token, tmpBase);
                cloneEnv.GIT_ASKPASS = askPass;
                cloneEnv.GIT_TERMINAL_PROMPT = '0';
            }

            // Shallow clone
            await this._exec(
                'git',
                ['clone', '--depth', '1', '--single-branch', cloneUrl, collectionsPath],
                { env: cloneEnv },
            );

            // Get the HEAD SHA
            const shaResult = await this._exec('git', ['-C', collectionsPath, 'rev-parse', 'HEAD']);
            const sha = shaResult.trim();

            // Check if we already have this SHA cached
            const existingFile = path.join(
                this._getCacheDir(),
                this._cacheFileName(org, repo, sha),
            );
            if (fs.existsSync(existingFile)) {
                try {
                    const raw = fs.readFileSync(existingFile, 'utf-8');
                    const parsed = JSON.parse(raw) as CachedSCMDocsBlob;
                    parsed.timestamp = Date.now();
                    this._memoryCache.set(key, parsed);
                    this._saveToDisk(parsed);
                    this._log(`SCMDocsCache: SHA unchanged for ${key}, using existing cache`);
                    return parsed;
                } catch {
                    // Fall through to re-index
                }
            }

            // Resolve ansible-doc from the active Python environment (Invariant 7)
            const ansibleDoc =
                (await getCommandService().getToolPath('ansible-doc')) ?? 'ansible-doc';
            const metadataRaw = await this._exec(
                ansibleDoc,
                ['--metadata-dump', '--no-fail-on-errors'],
                {
                    env: {
                        ...process.env,
                        ANSIBLE_COLLECTIONS_PATH: tmpBase,
                        ANSIBLE_COLLECTIONS_SCAN_SYS_PATH: 'false',
                        ANSIBLE_WARNINGS: 'false',
                        ANSIBLE_NOCOLOR: '1',
                    },
                },
            );

            const metadata = extractMetadataJson(metadataRaw);
            if (!metadata) {
                this._log(`SCMDocsCache: No JSON in ansible-doc output for ${key}`);
                return null;
            }

            const parsed = parseMetadataDump(metadata);

            // Only keep plugins from the target collection — ansible-doc always
            // includes ansible.builtin and any other builtins in its output.
            const targetFqcn = `${namespace}.${name}`;
            const plugins: Record<string, PluginInfo[]> = {};
            const pluginDocs: Record<string, PluginData> = {};

            const targetColl = parsed.collections.get(targetFqcn);
            if (targetColl) {
                for (const [pluginType, pluginList] of targetColl.pluginTypes) {
                    plugins[pluginType] = [...pluginList];
                }
            }

            const fqcnPrefix = `${targetFqcn}.`;
            for (const [docKey, docData] of parsed.pluginDocs) {
                if (docKey.startsWith(fqcnPrefix)) {
                    pluginDocs[docKey] = docData;
                }
            }

            // Sort plugins within each type
            for (const type of Object.keys(plugins)) {
                plugins[type].sort((a, b) => a.name.localeCompare(b.name));
            }

            const cached: CachedSCMDocsBlob = {
                formatVersion: CACHE_FORMAT_VERSION,
                timestamp: Date.now(),
                org,
                repo,
                namespace,
                name,
                sha,
                plugins,
                pluginDocs,
            };

            this._memoryCache.set(key, cached);
            this._saveToDisk(cached);

            const totalPlugins = Object.values(plugins).reduce((s, arr) => s + arr.length, 0);
            this._log(
                `SCMDocsCache: Cached ${String(totalPlugins)} plugins for ${key} (SHA: ${sha.substring(0, 7)})`,
            );

            return cached;
        } catch (error) {
            this._log(
                `SCMDocsCache: Failed to index ${key}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        } finally {
            this._cleanupTmpDir(tmpBase);
        }
    }

    /**
     * Returns a GitHub access token when VS Code authentication is available.
     *
     * @returns Access token string, or undefined when unavailable.
     */
    private async _getGitHubToken(): Promise<string | undefined> {
        if (vscode) {
            try {
                const session = await vscode.authentication.getSession('github', ['public_repo'], {
                    createIfNone: false,
                });
                return session?.accessToken;
            } catch {
                // Fall through
            }
        }
        return undefined;
    }

    /**
     * Creates a temporary GIT_ASKPASS script that echoes a token.
     * This avoids embedding the token in the clone URL (process listing / .git/config exposure).
     *
     * @param token - GitHub access token.
     * @param tmpDir - Temp directory to write the script into.
     * @returns Absolute path to the helper script.
     */
    private _writeAskPassScript(token: string, tmpDir: string): string {
        const scriptPath = path.join(tmpDir, 'git-askpass.sh');
        fs.writeFileSync(scriptPath, `#!/bin/sh\necho "${token}"\n`, { mode: 0o700 });
        return scriptPath;
    }

    /**
     * Persists a cached docs-blob entry to disk, cleaning up old entries for the same repo.
     *
     * @param cached - The docs-blob entry to write.
     */
    private _saveToDisk(cached: CachedSCMDocsBlob): void {
        const cacheDir = this._getCacheDir();
        const fileName = this._cacheFileName(cached.org, cached.repo, cached.sha);
        const filePath = path.join(cacheDir, fileName);

        try {
            // Clean up old cache files for this repo
            const prefix = `${cached.org}__${cached.repo}-`;
            const oldFiles = fs.readdirSync(cacheDir).filter((f) => f.startsWith(prefix));
            for (const old of oldFiles) {
                if (old !== fileName) {
                    fs.unlinkSync(path.join(cacheDir, old));
                }
            }

            fs.writeFileSync(filePath, JSON.stringify(cached), 'utf-8');
        } catch (error) {
            this._log(
                `SCMDocsCache: Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Removes a temporary directory tree used during clone+index.
     *
     * @param tmpDir - Absolute path to the temp directory to remove.
     */
    private _cleanupTmpDir(tmpDir: string): void {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Best effort cleanup
        }
    }

    /**
     * Executes a command and returns its stdout.
     *
     * @param cmd - The command to run.
     * @param args - Command arguments.
     * @param options - Optional spawn options (env, cwd, etc.).
     * @param options.env - Environment variables for the child process.
     * @returns Stdout output as a string.
     */
    private _exec(
        cmd: string,
        args: string[],
        options?: { env?: NodeJS.ProcessEnv },
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            execFile(
                cmd,
                args,
                {
                    maxBuffer: 50 * 1024 * 1024,
                    timeout: 120_000,
                    env: options?.env,
                },
                (error, stdout, stderr) => {
                    if (error) {
                        const raw = stderr ? `${error.message}\n${stderr}` : error.message;
                        const msg = raw.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
                        reject(new Error(msg));
                        return;
                    }
                    resolve(stdout);
                },
            );
        });
    }
}
