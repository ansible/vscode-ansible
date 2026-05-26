import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Conditional vscode import for standalone mode
let vscode: typeof import('vscode') | undefined;
try {
    vscode = require('vscode');
} catch {
    // Running standalone
}

/**
 * Represents a collection found in a GitHub organization
 */
export interface GitHubCollection {
    namespace: string;
    name: string;
    version: string;
    description: string;
    repository: string;
    org: string;
    htmlUrl: string;
    installUrl: string;  // git+https://github.com/org/repo.git
}

/**
 * Cache data structure for a GitHub org
 */
interface GitHubOrgCache {
    org: string;
    collections: GitHubCollection[];
    lastUpdated: string;
}

/**
 * Service to discover and cache Ansible collections from GitHub organizations
 */
export class GitHubCollectionCache {
    private static _instance: GitHubCollectionCache;
    private _caches: Map<string, GitHubOrgCache> = new Map();
    private _refreshInProgress: Set<string> = new Set();
    private _log: (msg: string) => void = console.log;

    private constructor() {}

    public static getInstance(): GitHubCollectionCache {
        if (!GitHubCollectionCache._instance) {
            GitHubCollectionCache._instance = new GitHubCollectionCache();
        }
        return GitHubCollectionCache._instance;
    }

    public setLogFunction(logFn: (msg: string) => void): void {
        this._log = logFn;
    }

    /**
     * Get the cache directory path (global, in ~/.cache/ansible-environments/)
     */
    private _getCacheDir(): string {
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- dynamic require for standalone/extension dual-mode
        const os = require('os');
        return path.join(os.homedir(), '.cache', 'ansible-environments');
    }

    /**
     * Get the cache file path for an org
     */
    private _getCacheFilePath(org: string): string {
        return path.join(this._getCacheDir(), `github-${org}.json`);
    }

    /**
     * Load cache from disk for an org
     */
    public loadFromDisk(org: string): GitHubOrgCache | undefined {
        const filePath = this._getCacheFilePath(org);
        if (!fs.existsSync(filePath)) {
            return undefined;
        }

        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const cache = JSON.parse(data) as GitHubOrgCache;
            this._caches.set(org, cache);
            
            const age = Date.now() - new Date(cache.lastUpdated).getTime();
            const ageStr = this._formatAge(age);
            this._log(`GitHubCollectionCache: Loaded ${cache.collections.length} collections for ${org} (${ageStr})`);
            
            return cache;
        } catch (error) {
            this._log(`GitHubCollectionCache: Error loading cache for ${org}: ${error}`);
            return undefined;
        }
    }

    /**
     * Save cache to disk for an org
     */
    private _saveToDisk(org: string, cache: GitHubOrgCache): void {
        const cacheDir = this._getCacheDir();
        const filePath = this._getCacheFilePath(org);

        try {
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
            this._log(`GitHubCollectionCache: Saved ${cache.collections.length} collections for ${org}`);
        } catch (error) {
            this._log(`GitHubCollectionCache: Error saving cache for ${org}: ${error}`);
        }
    }

    /**
     * Format age in human-readable format
     */
    private _formatAge(ms: number): string {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        if (hours < 1) {
            const minutes = Math.floor(ms / (1000 * 60));
            return minutes < 1 ? 'just now' : `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        }
        if (hours < 24) {
            return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        }
        const days = Math.floor(hours / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    /**
     * Get collections for an org (from cache)
     */
    public getCollections(org: string): GitHubCollection[] {
        const cache = this._caches.get(org);
        return cache?.collections || [];
    }

    /**
     * Get all collections from all cached orgs
     */
    public getAllCollections(): GitHubCollection[] {
        const all: GitHubCollection[] = [];
        for (const cache of this._caches.values()) {
            all.push(...cache.collections);
        }
        return all;
    }

    /**
     * Get collection count for an org
     */
    public getCount(org: string): number {
        return this._caches.get(org)?.collections.length || 0;
    }

    /**
     * Get last updated time for an org
     */
    public getLastUpdated(org: string): Date | undefined {
        const cache = this._caches.get(org);
        return cache ? new Date(cache.lastUpdated) : undefined;
    }

    /**
     * Check if a refresh is in progress for an org
     */
    public isRefreshing(org: string): boolean {
        return this._refreshInProgress.has(org);
    }

    /**
     * Refresh collections for a GitHub org
     */
    public async refresh(org: string): Promise<void> {
        if (!vscode) {
            this._log(`GitHubCollectionCache: Cannot refresh ${org} - not in VS Code context`);
            return;
        }

        if (this._refreshInProgress.has(org)) {
            this._log(`GitHubCollectionCache: Refresh already in progress for ${org}`);
            return;
        }

        this._refreshInProgress.add(org);
        this._log(`GitHubCollectionCache: Starting refresh for ${org}`);

        try {
            // Get GitHub authentication
            const session = await vscode.authentication.getSession('github', ['public_repo'], {
                createIfNone: true
            });

            if (!session) {
                this._log(`GitHubCollectionCache: GitHub authentication required for ${org}`);
                return;
            }

            const collections = await this._scanOrg(org, session.accessToken);
            
            const cache: GitHubOrgCache = {
                org,
                collections,
                lastUpdated: new Date().toISOString()
            };

            this._caches.set(org, cache);
            this._saveToDisk(org, cache);

            this._log(`GitHubCollectionCache: Found ${collections.length} collections in ${org}`);
        } catch (error) {
            this._log(`GitHubCollectionCache: Error refreshing ${org}: ${error}`);
        } finally {
            this._refreshInProgress.delete(org);
        }
    }

    /**
     * Scan a GitHub org for Ansible collections
     */
    private async _scanOrg(org: string, token: string): Promise<GitHubCollection[]> {
        const collections: GitHubCollection[] = [];

        try {
            // Search for repos with galaxy.yml at root
            const searchUrl = `https://api.github.com/search/code?q=org:${org}+filename:galaxy.yml+path:/`;
            
            const searchResponse = await fetch(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'VSCode-Ansible-Environments'
                }
            });

            if (!searchResponse.ok) {
                // If code search fails (rate limit, etc.), fall back to repo listing
                this._log(`GitHubCollectionCache: Code search failed for ${org}, falling back to repo scan`);
                return await this._scanOrgRepos(org, token);
            }

            const searchData = await searchResponse.json() as { items?: Array<{ repository: { full_name: string, html_url: string } }> };
            
            if (!searchData.items || searchData.items.length === 0) {
                this._log(`GitHubCollectionCache: No galaxy.yml files found in ${org}`);
                return collections;
            }

            // Get unique repos
            const repoSet = new Set<string>();
            for (const item of searchData.items) {
                repoSet.add(item.repository.full_name);
            }

            // Fetch galaxy.yml for each repo
            for (const repoFullName of repoSet) {
                try {
                    const collection = await this._fetchCollectionMetadata(repoFullName, token, org);
                    if (collection) {
                        collections.push(collection);
                    }
                } catch (error) {
                    this._log(`GitHubCollectionCache: Error fetching metadata for ${repoFullName}: ${error}`);
                }
            }

        } catch (error) {
            this._log(`GitHubCollectionCache: Error scanning ${org}: ${error}`);
        }

        return collections;
    }

    /**
     * Fallback: scan org repos directly
     */
    private async _scanOrgRepos(org: string, token: string): Promise<GitHubCollection[]> {
        const collections: GitHubCollection[] = [];
        let page = 1;
        const perPage = 100;

        // eslint-disable-next-line no-constant-condition -- paginated fetch loop, exits via break
        while (true) {
            const url = `https://api.github.com/orgs/${org}/repos?per_page=${perPage}&page=${page}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'VSCode-Ansible-Environments'
                }
            });

            if (!response.ok) {
                break;
            }

            const repos = await response.json() as Array<{ full_name: string, html_url: string }>;
            
            if (repos.length === 0) {
                break;
            }

            // Check each repo for galaxy.yml
            for (const repo of repos) {
                try {
                    const collection = await this._fetchCollectionMetadata(repo.full_name, token, org);
                    if (collection) {
                        collections.push(collection);
                    }
                } catch {
                    // Repo doesn't have galaxy.yml, skip
                }
            }

            if (repos.length < perPage) {
                break;
            }
            page++;
        }

        return collections;
    }

    /**
     * Fetch and parse galaxy.yml from a repo
     */
    private async _fetchCollectionMetadata(repoFullName: string, token: string, org: string): Promise<GitHubCollection | null> {
        // Try galaxy.yml first, then galaxy.yaml
        for (const filename of ['galaxy.yml', 'galaxy.yaml']) {
            const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/main/${filename}`;
            
            const response = await fetch(rawUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'VSCode-Ansible-Environments'
                }
            });

            if (response.ok) {
                const content = await response.text();
                return this._parseGalaxyYml(content, repoFullName, org);
            }

            // Try default branch
            const defaultUrl = `https://raw.githubusercontent.com/${repoFullName}/HEAD/${filename}`;
            const defaultResponse = await fetch(defaultUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'VSCode-Ansible-Environments'
                }
            });

            if (defaultResponse.ok) {
                const content = await defaultResponse.text();
                return this._parseGalaxyYml(content, repoFullName, org);
            }
        }

        return null;
    }

    /**
     * Parse galaxy.yml content using proper YAML parser
     */
    private _parseGalaxyYml(content: string, repoFullName: string, org: string): GitHubCollection | null {
        try {
            const data = yaml.load(content) as Record<string, unknown>;

            if (!data || typeof data !== 'object') {
                return null;
            }

            const namespace = data.namespace as string | undefined;
            const name = data.name as string | undefined;

            if (!namespace || !name) {
                return null;
            }

            // Get description - handle string or array
            let description = '';
            if (typeof data.description === 'string') {
                description = data.description.trim();
            } else if (Array.isArray(data.description)) {
                description = data.description.join(' ').trim();
            }

            return {
                namespace,
                name,
                version: (data.version as string) || '0.0.0',
                description,
                repository: repoFullName,
                org,
                htmlUrl: `https://github.com/${repoFullName}`,
                installUrl: `git+https://github.com/${repoFullName}.git`
            };
        } catch (error) {
            this._log(`GitHubCollectionCache: Failed to parse galaxy.yml for ${repoFullName}: ${error}`);
            return null;
        }
    }

    /**
     * Search collections across all cached orgs
     */
    public search(query: string): GitHubCollection[] {
        const q = query.toLowerCase();
        const results: GitHubCollection[] = [];

        for (const cache of this._caches.values()) {
            for (const collection of cache.collections) {
                const fullName = `${collection.namespace}.${collection.name}`;
                if (
                    fullName.toLowerCase().includes(q) ||
                    collection.description.toLowerCase().includes(q)
                ) {
                    results.push(collection);
                }
            }
        }

        return results;
    }

    /**
     * Initialize caches for configured orgs
     */
    public async initialize(orgs: string[]): Promise<void> {
        for (const org of orgs) {
            // Load from disk first
            const cached = this.loadFromDisk(org);
            
            if (!cached) {
                // No cache, try to refresh
                await this.refresh(org);
            }
        }
    }

    /**
     * Refresh all configured orgs
     */
    public async refreshAll(orgs: string[]): Promise<void> {
        for (const org of orgs) {
            await this.refresh(org);
        }
    }
}
