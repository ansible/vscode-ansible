/**
 * Skill Registry — discovers, indexes, and caches AI development skills
 * from multiple sources (ai-forge community, certified, partner, private).
 *
 * Supports auto-detection of repo formats:
 *   - Lola (lola-market.yml manifest, e.g. ai-forge / agentic-collections)
 *   - Vercel/harness (skills/ directory with SKILL.md files)
 *   - Generic (any repo with SKILL.md files in subdirectories)
 *
 * No hard dependency on vscode. Works standalone in MCP server and CLI.
 */

// Conditional vscode import — only used for the event emitter
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone (MCP server, CLI)
}

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import * as yaml from 'js-yaml';

import { log, SimpleEventEmitter, BUILTIN_SKILLS } from '@ansible/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Broad skill category. */
export type SkillCategory = 'standards' | 'sdlc' | 'domain' | 'scaffold' | 'workflow' | 'other';

/** How much the source is trusted. */
export type TrustLevel = 'community' | 'certified' | 'partner' | 'private';

/** Detected repository layout convention. */
export type RepoFormat = 'lola' | 'vercel' | 'generic';

/** Describes a location from which skills can be loaded. */
export interface SkillSource {
    /** Unique identifier for this source. */
    id: string;
    /** Transport type: github, registry (future), local disk, or builtin. */
    type: 'github' | 'registry' | 'local' | 'builtin';
    /** URL or path for the source. */
    url: string;
    /** Trust level applied to all skills from this source. */
    trust: TrustLevel;
    /** Hours between automatic refreshes (default: 24). */
    refreshInterval?: number;
}

/** A single indexed skill. */
export interface SkillEntry {
    /** Globally unique ID, e.g. "ai-forge/ansible-collection-sdlc/commit". */
    id: string;
    /** Source ID this skill came from. */
    source: string;
    /** Module or collection grouping. */
    module: string;
    /** Human-readable skill name. */
    name: string;
    /** Short description. */
    description: string;
    /** Phrases that trigger this skill. */
    triggers: string[];
    /** Broad category. */
    category: SkillCategory;
    /** Optional domain qualifier (e.g. "cloud", "network"). */
    domain?: string;
    /** Trust level inherited from the source. */
    trust: TrustLevel;
    /** Freeform tags for search. */
    tags: string[];
    /** URL to fetch SKILL.md content on demand (persisted in cache). */
    contentUrl?: string;
    /** Full SKILL.md body — loaded on demand, undefined until fetched. */
    content?: string;
    /** Paths to supplementary files (reference.md, templates, etc.). */
    references?: string[];
}

/** Synthetic source for bundled internal skills (ADR-014). */
const BUILTIN_SOURCE: SkillSource = {
    id: 'builtin',
    type: 'builtin',
    url: 'bundled',
    trust: 'certified',
};

// ---------------------------------------------------------------------------
// Internal interfaces
// ---------------------------------------------------------------------------

/** Shape of lola-market.yml module entries. */
interface LolaModuleEntry {
    name: string;
    description?: string;
    version?: string;
    repository?: string;
    path?: string;
    tags?: string[];
}

/** Shape of a lola-market.yml manifest. */
interface LolaMarketManifest {
    name?: string;
    description?: string;
    version?: string;
    modules?: LolaModuleEntry[];
}

/** SKILL.md YAML frontmatter. */
interface SkillFrontmatter {
    name?: string;
    description?: string;
    version?: string;
    type?: string;
    mandatory?: boolean;
    triggers?: string[] | string;
    category?: string;
    domain?: string;
    tags?: string[];
    'allowed-tools'?: string[];
    'argument-hint'?: string;
    sdlc_mcp_tools?: string[];
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

let CACHE_DIR = path.join(os.tmpdir(), 'ansible-mcp', 'skills');
const INDEX_CACHE_FILE = 'skill-index.json';

/** Persisted index for one source. */
interface CachedIndex {
    timestamp: number;
    sourceId: string;
    sourceUrl?: string;
    format?: RepoFormat;
    skills: SkillEntry[];
}

// ---------------------------------------------------------------------------
// GitHub auth
// ---------------------------------------------------------------------------

let _cachedGhToken: string | undefined | null;
let _tokenRejected = false;

/**
 * Resolve a GitHub token from the environment or gh CLI.
 * Returns undefined when the token was previously rejected (401)
 * to avoid noisy retry loops.
 *
 * @returns Token string or undefined when no auth is available.
 */
function _resolveGitHubToken(): string | undefined {
    if (_tokenRejected) {
        return undefined;
    }

    if (_cachedGhToken !== undefined) {
        return _cachedGhToken ?? undefined;
    }

    const envToken = process.env.GITHUB_TOKEN;
    if (envToken) {
        _cachedGhToken = envToken;
        return envToken;
    }

    try {
        const result = childProcess.execSync('gh auth token', {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const token = result.trim();
        if (token) {
            _cachedGhToken = token;
            return token;
        }
    } catch {
        // gh not installed or not authenticated
    }

    _cachedGhToken = null;
    return undefined;
}

/**
 * Mark the cached token as rejected so subsequent requests
 * skip auth rather than retrying with a known-bad token.
 */
function _markTokenRejected(): void {
    if (_cachedGhToken) {
        log('SkillRegistry: GitHub token rejected, disabling auth for this session');
    }
    _tokenRejected = true;
}

/**
 * Reset the cached GitHub token (for tests).
 */
export function _resetGitHubToken(): void {
    _cachedGhToken = undefined;
    _tokenRejected = false;
}

// ---------------------------------------------------------------------------
// SkillRegistry
// ---------------------------------------------------------------------------

/**
 * Singleton registry that discovers, indexes, and caches AI development skills.
 *
 * Supports local sources, GitHub repos with Lola manifests,
 * Vercel-style skills/ directories, and generic SKILL.md repos.
 */
export class SkillRegistry {
    private static _instance: SkillRegistry | undefined;

    private _sources: SkillSource[] = [];
    private _skills = new Map<string, SkillEntry>();
    private _loading = false;
    private _loaded = false;
    private _forceRefresh = false;
    private _loadPromise: Promise<void> | undefined;
    private _onDidLoad = vscode ? new vscode.EventEmitter<void>() : new SimpleEventEmitter<void>();

    /** Fires after skills finish loading. */
    public readonly onDidLoad = this._onDidLoad.event;

    /** Private constructor for singleton access via getInstance(). */
    // eslint-disable-next-line @typescript-eslint/no-empty-function, no-empty-function -- singleton pattern requires private constructor
    private constructor() {}

    /**
     * Returns the singleton instance, creating it if necessary.
     *
     * @returns The shared SkillRegistry instance.
     */
    static getInstance(): SkillRegistry {
        SkillRegistry._instance ??= new SkillRegistry();
        return SkillRegistry._instance;
    }

    /** Destroy the singleton for test isolation. */
    static resetInstance(): void {
        SkillRegistry._instance = undefined;
    }

    /**
     * Override the disk-cache directory (useful for tests).
     *
     * @param dir - Absolute path to an alternative cache directory.
     */
    static setCacheDir(dir: string): void {
        CACHE_DIR = dir;
    }

    // -- Configuration ------------------------------------------------------

    /**
     * Replace the set of configured sources and reset loaded state.
     *
     * @param sources - The new source list.
     */
    setSources(sources: SkillSource[]): void {
        this._sources = sources;
        this._loaded = false;
        this._skills.clear();
    }

    /**
     * Returns configured sources plus the synthetic builtin source.
     *
     * @returns Array of skill sources (builtin first).
     */
    getSources(): SkillSource[] {
        return [BUILTIN_SOURCE, ...this._sources];
    }

    // -- Loading ------------------------------------------------------------

    /**
     * Loads skills once; subsequent calls are no-ops until reset.
     *
     * @returns A promise that resolves when loading is complete.
     */
    async ensureLoaded(): Promise<void> {
        if (this._loaded) {
            return;
        }
        if (this._loadPromise) {
            return this._loadPromise;
        }
        this._loadPromise = this._loadAll();
        await this._loadPromise;
        this._loadPromise = undefined;
    }

    /** Force-reload all sources, bypassing the cache. */
    async refresh(): Promise<void> {
        this._loaded = false;
        this._skills.clear();
        this._forceRefresh = true;
        await this.ensureLoaded();
        this._forceRefresh = false;
    }

    /**
     * Whether skill data has been loaded.
     *
     * @returns True when at least one load cycle has completed.
     */
    isLoaded(): boolean {
        return this._loaded;
    }

    // -- Queries ------------------------------------------------------------

    /**
     * Returns every indexed skill.
     *
     * @returns Flat array of all skills.
     */
    getAllSkills(): SkillEntry[] {
        return Array.from(this._skills.values());
    }

    /**
     * Look up a skill by its full ID.
     *
     * @param id - Skill ID, e.g. "ai-forge/ansible-collection-sdlc/commit".
     * @returns The matching skill or undefined.
     */
    getSkill(id: string): SkillEntry | undefined {
        return this._skills.get(id);
    }

    /**
     * Search skills by keyword against name, description, triggers, and tags.
     *
     * @param query - Space-separated search terms.
     * @param opts - Optional filters and limit.
     * @param opts.category - Filter results to a single category.
     * @param opts.domain - Filter results to a domain qualifier.
     * @param opts.source - Restrict results to a source ID.
     * @param opts.limit - Maximum number of results (default 20).
     * @returns Matching skills sorted by relevance.
     */
    search(
        query: string,
        opts?: {
            category?: SkillCategory;
            domain?: string;
            source?: string;
            limit?: number;
        },
    ): SkillEntry[] {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const limit = opts?.limit ?? 20;

        let results = this.getAllSkills();

        if (opts?.category) {
            results = results.filter((s) => s.category === opts.category);
        }
        if (opts?.domain) {
            results = results.filter((s) => s.domain === opts.domain);
        }
        if (opts?.source) {
            results = results.filter((s) => s.source === opts.source);
        }

        if (terms.length === 0) {
            return results.slice(0, limit);
        }

        const scored = results.map((skill) => {
            let score = 0;
            const haystack = [
                skill.name,
                skill.description,
                ...skill.triggers,
                ...skill.tags,
                skill.module,
                skill.domain ?? '',
            ]
                .join(' ')
                .toLowerCase();

            for (const term of terms) {
                if (skill.name.toLowerCase().includes(term)) {
                    score += 10;
                }
                if (skill.description.toLowerCase().includes(term)) {
                    score += 5;
                }
                if (skill.triggers.some((t) => t.toLowerCase().includes(term))) {
                    score += 8;
                }
                if (skill.tags.some((t) => t.toLowerCase().includes(term))) {
                    score += 3;
                }
                if (haystack.includes(term)) {
                    score += 1;
                }
            }
            return { skill, score };
        });

        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((s) => s.skill);
    }

    /**
     * Load full content for a skill (fetches SKILL.md body on demand).
     *
     * @param id - Skill ID.
     * @returns The SKILL.md body text, or undefined.
     */
    async loadSkillContent(id: string): Promise<string | undefined> {
        const skill = this._skills.get(id);
        if (!skill) {
            return undefined;
        }
        if (skill.content) {
            return skill.content;
        }

        const source = this._sources.find((s) => s.id === skill.source);
        if (!source) {
            return undefined;
        }

        try {
            const content = await this._fetchSkillContent(source, skill);
            if (content) {
                skill.content = content;
            }
            return content;
        } catch (err: unknown) {
            log(`SkillRegistry: failed to load content for ${id}: ${String(err)}`);
            return undefined;
        }
    }

    // -- Private: loading ---------------------------------------------------

    /** Iterates all configured sources (builtin first), loading skills from each. */
    private async _loadAll(): Promise<void> {
        if (this._loading) {
            return;
        }
        this._loading = true;

        try {
            this._loadBuiltinSource();

            for (const source of this._sources) {
                try {
                    await this._loadSource(source);
                } catch (err: unknown) {
                    log(`SkillRegistry: failed to load source ${source.id}: ${String(err)}`);
                }
            }
            this._loaded = true;
            this._onDidLoad.fire();
        } finally {
            this._loading = false;
        }
    }

    /**
     * Loads a single source, using cache when available.
     *
     * @param source - The source to load.
     */
    private async _loadSource(source: SkillSource): Promise<void> {
        const cached = this._forceRefresh ? undefined : this._readCache(source.id);
        const maxAge = (source.refreshInterval ?? 24) * 60 * 60 * 1000;
        const urlMatch = !cached?.sourceUrl || cached.sourceUrl === source.url;

        if (cached && urlMatch && Date.now() - cached.timestamp < maxAge) {
            for (const skill of cached.skills) {
                this._skills.set(skill.id, skill);
            }
            log(
                `SkillRegistry: loaded ${String(cached.skills.length)} skills from cache for ${source.id}`,
            );
            return;
        }
        if (cached && !urlMatch) {
            log(`SkillRegistry: cache invalidated for ${source.id} (URL changed)`);
        }

        let skills: SkillEntry[] = [];
        let format: RepoFormat | undefined;
        switch (source.type) {
            case 'github': {
                const result = await this._loadGitHubSource(source);
                skills = result.skills;
                format = result.format;
                break;
            }
            case 'local':
                skills = this._loadLocalSource(source);
                break;
            case 'registry':
                skills = this._loadRegistrySource();
                break;
            case 'builtin':
                break;
        }

        for (const skill of skills) {
            this._skills.set(skill.id, skill);
        }

        if (skills.length > 0 || source.type === 'local') {
            this._writeCache(source.id, skills, format, source.url);
        }
        log(
            `SkillRegistry: loaded ${String(skills.length)} skills from ${source.id}` +
                (format ? ` (${format} format)` : ''),
        );
    }

    // -- Private: GitHub source (auto-detect) --------------------------------

    /**
     * Auto-detects the repo format and delegates to the appropriate loader.
     *
     * @param source - GitHub source to load.
     * @returns Discovered skills and detected format.
     */
    private async _loadGitHubSource(
        source: SkillSource,
    ): Promise<{ skills: SkillEntry[]; format: RepoFormat }> {
        const format = await this._detectRepoFormat(source);
        log(`SkillRegistry: detected ${format} format for ${source.id}`);

        switch (format) {
            case 'lola':
                return { skills: await this._loadLolaSource(source), format };
            case 'vercel':
                return { skills: await this._loadVercelSource(source), format };
            default:
                return { skills: await this._loadGenericGitHubSource(source), format };
        }
    }

    /**
     * Probes a GitHub repo to determine its skill layout convention.
     *
     * @param source - The source whose URL to probe.
     * @returns The detected repo format.
     */
    private async _detectRepoFormat(source: SkillSource): Promise<RepoFormat> {
        const repoPath = this._githubRepoPath(source.url);
        if (!repoPath) {
            return 'generic';
        }

        const rawBase = this._githubRawBase(source.url);
        if (rawBase) {
            const rawLolaCheck = await this._httpGet(
                `${rawBase}/main/lola-market.yml`,
                this._getAuthHeaders(),
            );
            if (rawLolaCheck) {
                return 'lola';
            }
        }

        const apiHeaders = this._githubApiHeaders();

        const lolaCheck = await this._httpGet(
            `https://api.github.com/repos/${repoPath}/contents/lola-market.yml`,
            apiHeaders,
        );
        if (lolaCheck) {
            return 'lola';
        }

        const marketplaceCheck = await this._httpGet(
            `https://api.github.com/repos/${repoPath}/contents/marketplace`,
            apiHeaders,
        );
        if (marketplaceCheck) {
            try {
                const entries = JSON.parse(marketplaceCheck) as {
                    name: string;
                    type: string;
                }[];
                if (
                    Array.isArray(entries) &&
                    entries.some((e) => e.type === 'file' && e.name.endsWith('.yml'))
                ) {
                    return 'lola';
                }
            } catch {
                /* not valid JSON directory listing */
            }
        }

        const skillsCheck = await this._httpGet(
            `https://api.github.com/repos/${repoPath}/contents/skills`,
            apiHeaders,
        );
        if (skillsCheck) {
            try {
                const entries = JSON.parse(skillsCheck) as { type: string }[];
                if (Array.isArray(entries) && entries.some((e) => e.type === 'dir')) {
                    return 'vercel';
                }
            } catch {
                /* not valid JSON directory listing */
            }
        }

        return 'generic';
    }

    // -- Private: Lola format (ai-forge / agentic-collections) ---------------

    /**
     * Loads skills from a Lola-manifest repo including unlisted modules.
     *
     * @param source - The Lola-format source.
     * @returns All discovered skills.
     */
    private async _loadLolaSource(source: SkillSource): Promise<SkillEntry[]> {
        const manifest = await this._fetchLolaManifest(source);
        if (!manifest?.modules) {
            return [];
        }

        const skills: SkillEntry[] = [];
        const coveredDirs = new Set<string>();

        for (const mod of manifest.modules) {
            const moduleSkills = await this._fetchModuleSkills(source, mod);
            skills.push(...moduleSkills);
            const rootDir = (mod.path ?? mod.name).split('/')[0];
            coveredDirs.add(rootDir);
        }

        const extraSkills = await this._discoverUnlistedModules(source, coveredDirs);
        skills.push(...extraSkills);

        return skills;
    }

    /**
     * Fetches and parses the Lola manifest from root or marketplace/.
     *
     * @param source - The source to fetch from.
     * @returns Parsed manifest or undefined.
     */
    private async _fetchLolaManifest(source: SkillSource): Promise<LolaMarketManifest | undefined> {
        const rawBase = this._githubRawBase(source.url);
        if (!rawBase) {
            return undefined;
        }
        const authHeaders = this._getAuthHeaders();

        const rootManifest = await this._httpGet(`${rawBase}/main/lola-market.yml`, authHeaders);
        if (rootManifest) {
            return this._parseLolaManifest(rootManifest, source.id, 'lola-market.yml');
        }

        const repoPath = this._githubRepoPath(source.url);
        if (repoPath) {
            const apiHeaders = this._githubApiHeaders();
            const dirText = await this._httpGet(
                `https://api.github.com/repos/${repoPath}/contents/marketplace`,
                apiHeaders,
            );
            if (dirText) {
                try {
                    const entries = JSON.parse(dirText) as {
                        name: string;
                        type: string;
                    }[];
                    const ymlFile = entries.find(
                        (e) => e.type === 'file' && e.name.endsWith('.yml'),
                    );
                    if (ymlFile) {
                        const text = await this._httpGet(
                            `${rawBase}/main/marketplace/${ymlFile.name}`,
                            authHeaders,
                        );
                        if (text) {
                            return this._parseLolaManifest(
                                text,
                                source.id,
                                `marketplace/${ymlFile.name}`,
                            );
                        }
                    }
                } catch {
                    /* directory listing parse failed */
                }
            }
        }

        return undefined;
    }

    /**
     * Attempts to parse a YAML string as a Lola manifest.
     *
     * @param text - Raw YAML text.
     * @param sourceId - Source ID for error logging.
     * @param fileName - File name for error logging.
     * @returns Parsed manifest or undefined on parse failure.
     */
    private _parseLolaManifest(
        text: string,
        sourceId: string,
        fileName: string,
    ): LolaMarketManifest | undefined {
        try {
            return yaml.load(text) as LolaMarketManifest;
        } catch (err: unknown) {
            log(`SkillRegistry: failed to parse ${fileName} for ${sourceId}: ${String(err)}`);
            return undefined;
        }
    }

    /**
     * Fetches skills from a single Lola module's skills/ directory.
     *
     * @param source - Parent source.
     * @param mod - Lola module entry from the manifest.
     * @returns Skills discovered under this module.
     */
    private async _fetchModuleSkills(
        source: SkillSource,
        mod: LolaModuleEntry,
    ): Promise<SkillEntry[]> {
        const rawBase = this._githubRawBase(source.url);
        if (!rawBase) {
            return [];
        }

        const modulePath = mod.path ?? `${mod.name}/module`;
        const authHeaders = this._getAuthHeaders();
        const agentsUrl = `${rawBase}/main/${modulePath}/AGENTS.md`;
        const agentsContent = await this._httpGet(agentsUrl, authHeaders);

        const skills = await this._discoverSkillsFromTree(source, mod, modulePath);
        if (skills.length > 0) {
            return skills;
        }

        if (agentsContent) {
            return [
                {
                    id: `${source.id}/${mod.name}`,
                    source: source.id,
                    module: mod.name,
                    name: mod.name,
                    description: mod.description ?? mod.name,
                    triggers: [],
                    category: this._inferCategory(mod),
                    tags: mod.tags ?? [],
                    trust: source.trust,
                    contentUrl: agentsUrl,
                    content: agentsContent,
                },
            ];
        }
        return [];
    }

    /**
     * Scans a module's skills/ directory for SKILL.md files via the GitHub API.
     *
     * @param source - Parent source.
     * @param mod - Module entry.
     * @param modulePath - Filesystem path within the repo.
     * @returns Individual skill entries from each sub-directory.
     */
    private async _discoverSkillsFromTree(
        source: SkillSource,
        mod: LolaModuleEntry,
        modulePath: string,
    ): Promise<SkillEntry[]> {
        const repoPath = this._githubRepoPath(source.url);
        if (!repoPath) {
            return [];
        }

        const authHeaders = this._getAuthHeaders();
        const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${modulePath}/skills`;
        const text = await this._httpGet(apiUrl, this._githubApiHeaders());
        if (!text) {
            return [];
        }

        let entries: { name: string; type: string }[];
        try {
            entries = JSON.parse(text) as { name: string; type: string }[];
        } catch {
            return [];
        }
        if (!Array.isArray(entries)) {
            return [];
        }

        const skills: SkillEntry[] = [];
        const rawBase = this._githubRawBase(source.url);
        if (!rawBase) {
            return [];
        }

        for (const entry of entries) {
            if (entry.type !== 'dir') {
                continue;
            }

            const skillMdUrl = `${rawBase}/main/${modulePath}/skills/${entry.name}/SKILL.md`;
            const skillMd = await this._httpGet(skillMdUrl, authHeaders);
            if (!skillMd) {
                continue;
            }

            const { frontmatter, body } = this._parseSkillMd(skillMd);
            skills.push({
                id: `${source.id}/${mod.name}/${entry.name}`,
                source: source.id,
                module: mod.name,
                name: frontmatter.name ?? entry.name,
                description: frontmatter.description ?? '',
                triggers: this._normalizeTriggers(frontmatter.triggers),
                category:
                    (frontmatter.category as SkillCategory | undefined) ?? this._inferCategory(mod),
                domain: frontmatter.domain,
                tags: frontmatter.tags ?? mod.tags ?? [],
                trust: source.trust,
                contentUrl: skillMdUrl,
                content: body,
            });
        }
        return skills;
    }

    /**
     * Scan the repo root for directories not in the manifest that follow
     * the Lola convention ({name}/module/skills/).
     *
     * @param source - Parent source.
     * @param coveredDirs - Set of directories already handled by the manifest.
     * @returns Skills from unlisted modules.
     */
    private async _discoverUnlistedModules(
        source: SkillSource,
        coveredDirs: Set<string>,
    ): Promise<SkillEntry[]> {
        const repoPath = this._githubRepoPath(source.url);
        if (!repoPath) {
            return [];
        }

        const apiHeaders = this._githubApiHeaders();
        const rootText = await this._httpGet(
            `https://api.github.com/repos/${repoPath}/contents/`,
            apiHeaders,
        );
        if (!rootText) {
            return [];
        }

        let entries: { name: string; type: string }[];
        try {
            entries = JSON.parse(rootText) as { name: string; type: string }[];
        } catch {
            return [];
        }
        if (!Array.isArray(entries)) {
            return [];
        }

        const skills: SkillEntry[] = [];
        for (const entry of entries) {
            if (entry.type !== 'dir' || entry.name.startsWith('.') || coveredDirs.has(entry.name)) {
                continue;
            }

            const skillsDirCheck = await this._httpGet(
                `https://api.github.com/repos/${repoPath}/contents/${entry.name}/module/skills`,
                apiHeaders,
            );
            if (!skillsDirCheck) {
                continue;
            }

            try {
                const skillEntries = JSON.parse(skillsDirCheck) as unknown[];
                if (!Array.isArray(skillEntries)) {
                    continue;
                }
            } catch {
                continue;
            }

            log(`SkillRegistry: discovered unlisted module ${entry.name} in ${source.id}`);
            const syntheticMod: LolaModuleEntry = {
                name: entry.name,
                description: entry.name,
                path: `${entry.name}/module`,
                tags: [],
            };
            const modSkills = await this._fetchModuleSkills(source, syntheticMod);
            skills.push(...modSkills);
        }

        return skills;
    }

    // -- Private: Vercel/harness format (skills/ directory) ------------------

    /**
     * Loads skills from a repo with a top-level skills/ directory.
     *
     * @param source - The Vercel/harness-format source.
     * @returns All discovered skills.
     */
    private async _loadVercelSource(source: SkillSource): Promise<SkillEntry[]> {
        const repoPath = this._githubRepoPath(source.url);
        if (!repoPath) {
            return [];
        }

        const authHeaders = this._getAuthHeaders();
        const apiHeaders = this._githubApiHeaders();

        const dirText = await this._httpGet(
            `https://api.github.com/repos/${repoPath}/contents/skills`,
            apiHeaders,
        );
        if (!dirText) {
            return [];
        }

        let entries: { name: string; type: string }[];
        try {
            entries = JSON.parse(dirText) as { name: string; type: string }[];
        } catch {
            return [];
        }
        if (!Array.isArray(entries)) {
            return [];
        }

        const rawBase = this._githubRawBase(source.url);
        if (!rawBase) {
            return [];
        }
        const repoName = repoPath.split('/').pop() ?? source.id;
        const skills: SkillEntry[] = [];

        for (const entry of entries) {
            if (entry.type !== 'dir' || entry.name.startsWith('.')) {
                continue;
            }

            const skillMdUrl = `${rawBase}/main/skills/${entry.name}/SKILL.md`;
            const skillMd = await this._httpGet(skillMdUrl, authHeaders);
            if (!skillMd) {
                continue;
            }

            const { frontmatter, body } = this._parseSkillMd(skillMd);
            skills.push({
                id: `${source.id}/${entry.name}`,
                source: source.id,
                module: repoName,
                name: frontmatter.name ?? entry.name,
                description: frontmatter.description ?? '',
                triggers: this._normalizeTriggers(frontmatter.triggers),
                category:
                    (frontmatter.category as SkillCategory | undefined) ??
                    this._inferCategoryFromFrontmatter(frontmatter) ??
                    'other',
                domain: frontmatter.domain,
                tags: frontmatter.tags ?? [],
                trust: source.trust,
                contentUrl: skillMdUrl,
                content: body,
            });
        }

        return skills;
    }

    // -- Private: generic format (scan root for SKILL.md dirs) --------------

    /**
     * Scans root-level directories for SKILL.md files as a fallback.
     *
     * @param source - The generic-format source.
     * @returns All discovered skills.
     */
    private async _loadGenericGitHubSource(source: SkillSource): Promise<SkillEntry[]> {
        const repoPath = this._githubRepoPath(source.url);
        if (!repoPath) {
            return [];
        }

        const authHeaders = this._getAuthHeaders();
        const apiHeaders = this._githubApiHeaders();

        const rootText = await this._httpGet(
            `https://api.github.com/repos/${repoPath}/contents/`,
            apiHeaders,
        );
        if (!rootText) {
            return [];
        }

        let entries: { name: string; type: string }[];
        try {
            entries = JSON.parse(rootText) as { name: string; type: string }[];
        } catch {
            return [];
        }
        if (!Array.isArray(entries)) {
            return [];
        }

        const rawBase = this._githubRawBase(source.url);
        if (!rawBase) {
            return [];
        }
        const skills: SkillEntry[] = [];

        for (const entry of entries) {
            if (entry.type !== 'dir' || entry.name.startsWith('.')) {
                continue;
            }

            const skillMdUrl = `${rawBase}/main/${entry.name}/SKILL.md`;
            const skillMd = await this._httpGet(skillMdUrl, authHeaders);
            if (!skillMd) {
                continue;
            }

            const { frontmatter, body } = this._parseSkillMd(skillMd);
            skills.push({
                id: `${source.id}/${entry.name}`,
                source: source.id,
                module: source.id,
                name: frontmatter.name ?? entry.name,
                description: frontmatter.description ?? '',
                triggers: this._normalizeTriggers(frontmatter.triggers),
                category: (frontmatter.category as SkillCategory | undefined) ?? 'other',
                domain: frontmatter.domain,
                tags: frontmatter.tags ?? [],
                trust: source.trust,
                contentUrl: skillMdUrl,
                content: body,
            });
        }
        return skills;
    }

    // -- Private: local source ----------------------------------------------

    /**
     * Loads skills from a local directory of SKILL.md files.
     *
     * @param source - The local source with a directory path in url.
     * @returns Discovered skills from disk.
     */
    private _loadLocalSource(source: SkillSource): SkillEntry[] {
        const skillsDir = source.url;
        if (!fs.existsSync(skillsDir)) {
            return [];
        }

        const skills: SkillEntry[] = [];
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) {
                continue;
            }

            const raw = fs.readFileSync(skillMdPath, 'utf-8');
            const { frontmatter, body } = this._parseSkillMd(raw);

            skills.push({
                id: `${source.id}/${entry.name}`,
                source: source.id,
                module: source.id,
                name: frontmatter.name ?? entry.name,
                description: frontmatter.description ?? '',
                triggers: this._normalizeTriggers(frontmatter.triggers),
                category: (frontmatter.category as SkillCategory | undefined) ?? 'other',
                domain: frontmatter.domain,
                tags: frontmatter.tags ?? [],
                trust: source.trust,
                content: body,
            });
        }
        return skills;
    }

    // -- Private: registry source (future) ----------------------------------

    /**
     * Placeholder for future registry-based source support.
     *
     * @returns Empty array (not yet implemented).
     */
    private _loadRegistrySource(): SkillEntry[] {
        log('SkillRegistry: registry source type not yet implemented');
        return [];
    }

    // -- Private: builtin source (bundled internal skills) ------------------

    /**
     * Loads skills from the bundled internal skills manifest.
     * Always runs before user-configured sources. Not cached to disk.
     */
    private _loadBuiltinSource(): void {
        let count = 0;
        for (const [slug, raw] of Object.entries(BUILTIN_SKILLS)) {
            const { frontmatter, body } = this._parseSkillMd(raw);
            const id = `builtin/${slug}`;
            this._skills.set(id, {
                id,
                source: 'builtin',
                module: 'builtin',
                name: frontmatter.name ?? slug,
                description: frontmatter.description ?? '',
                triggers: this._normalizeTriggers(frontmatter.triggers),
                category:
                    (frontmatter.category as SkillCategory | undefined) ??
                    this._inferCategoryFromFrontmatter(frontmatter) ??
                    'other',
                domain: frontmatter.domain,
                tags: frontmatter.tags ?? [],
                trust: 'certified',
                content: body,
            });
            count++;
        }
        log(`SkillRegistry: loaded ${String(count)} builtin skills`);
    }

    // -- Private: fetch skill content on demand -----------------------------

    /**
     * Fetches the SKILL.md body for a skill from its source.
     *
     * @param source - The source the skill belongs to.
     * @param skill - The skill entry with a contentUrl or name.
     * @returns The parsed body text, or undefined.
     */
    private async _fetchSkillContent(
        source: SkillSource,
        skill: SkillEntry,
    ): Promise<string | undefined> {
        if (source.type === 'local') {
            const skillMdPath = path.join(source.url, skill.name, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
                const raw = fs.readFileSync(skillMdPath, 'utf-8');
                const { body } = this._parseSkillMd(raw);
                return body;
            }
            return undefined;
        }

        if (skill.contentUrl) {
            const raw = await this._httpGet(skill.contentUrl, this._getAuthHeaders());
            if (!raw) {
                log(`SkillRegistry: failed to fetch content from ${skill.contentUrl}`);
                return undefined;
            }
            const { body } = this._parseSkillMd(raw);
            return body;
        }

        return undefined;
    }

    // -- Private: SKILL.md parsing ------------------------------------------

    /**
     * Parses a SKILL.md file into its YAML frontmatter and body sections.
     *
     * @param raw - Raw SKILL.md file content.
     * @returns Parsed frontmatter object and the body text below the fence.
     */
    private _parseSkillMd(raw: string): { frontmatter: SkillFrontmatter; body: string } {
        const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
        if (!fmMatch) {
            return { frontmatter: {}, body: raw };
        }

        let frontmatter: SkillFrontmatter = {};
        try {
            const parsed = yaml.load(fmMatch[1]) as SkillFrontmatter | undefined;
            frontmatter = parsed ?? {};
        } catch {
            // Malformed frontmatter — treat entire file as body
        }
        return { frontmatter, body: fmMatch[2].trim() };
    }

    /**
     * Normalize triggers: harness uses array or comma-separated string.
     *
     * @param raw - String, array, or undefined triggers value.
     * @returns Flat array of trigger strings.
     */
    private _normalizeTriggers(raw: string[] | string | undefined): string[] {
        if (!raw) {
            return [];
        }
        if (Array.isArray(raw)) {
            return raw;
        }
        return raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
    }

    // -- Private: category inference ----------------------------------------

    /**
     * Infers a category from Lola module name and tags.
     *
     * @param mod - The Lola module entry.
     * @returns Best-guess skill category.
     */
    private _inferCategory(mod: LolaModuleEntry): SkillCategory {
        const name = mod.name.toLowerCase();
        const tags = (mod.tags ?? []).join(' ').toLowerCase();
        const combined = `${name} ${tags}`;

        if (combined.includes('sdlc') || combined.includes('lifecycle')) {
            return 'sdlc';
        }
        if (
            combined.includes('standard') ||
            combined.includes('review') ||
            combined.includes('lint')
        ) {
            return 'standards';
        }
        if (
            combined.includes('scaffold') ||
            combined.includes('role') ||
            combined.includes('creator')
        ) {
            return 'scaffold';
        }
        if (
            combined.includes('cloud') ||
            combined.includes('network') ||
            combined.includes('security')
        ) {
            return 'domain';
        }
        if (combined.includes('workflow')) {
            return 'workflow';
        }
        return 'other';
    }

    /**
     * Infer category from SKILL.md frontmatter type field (harness convention).
     *
     * @param fm - Parsed frontmatter object.
     * @returns Inferred category or undefined when the type is unrecognized.
     */
    private _inferCategoryFromFrontmatter(fm: SkillFrontmatter): SkillCategory | undefined {
        const type = fm.type?.toLowerCase();
        if (!type) {
            return undefined;
        }

        if (type === 'review' || type === 'standards') {
            return 'standards';
        }
        if (type === 'workflow' || type === 'sdlc' || type === 'implementation') {
            return 'sdlc';
        }
        if (type === 'scaffold' || type === 'create') {
            return 'scaffold';
        }
        if (type === 'domain') {
            return 'domain';
        }
        return undefined;
    }

    // -- Private: GitHub URL helpers ----------------------------------------

    /**
     * Extracts the raw.githubusercontent.com base URL from a GitHub repo URL.
     *
     * @param url - GitHub repository URL.
     * @returns Raw content base URL, or undefined for non-GitHub URLs.
     */
    private _githubRawBase(url: string): string | undefined {
        const match = /github\.com\/([^/]+\/[^/]+)/.exec(url);
        if (!match) {
            return undefined;
        }
        return `https://raw.githubusercontent.com/${match[1]}`;
    }

    /**
     * Extracts the "owner/repo" path from a GitHub URL.
     *
     * @param url - GitHub repository URL.
     * @returns The "owner/repo" string, or undefined.
     */
    private _githubRepoPath(url: string): string | undefined {
        const match = /github\.com\/([^/]+\/[^/]+)/.exec(url);
        return match?.[1]?.replace(/\.git$/, '');
    }

    // -- Private: GitHub auth -----------------------------------------------

    /**
     * Returns an Authorization header if a GitHub token is available.
     *
     * @returns Headers object, possibly empty.
     */
    private _getAuthHeaders(): Record<string, string> {
        const token = _resolveGitHubToken();
        if (!token) {
            return {};
        }
        return { Authorization: `token ${token}` };
    }

    /**
     * Standard headers for GitHub API requests.
     *
     * @returns Headers with Accept, User-Agent, and optional Authorization.
     */
    private _githubApiHeaders(): Record<string, string> {
        return {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'ansible-environments-mcp',
            ...this._getAuthHeaders(),
        };
    }

    // -- Private: HTTP ------------------------------------------------------

    /**
     * Performs a GET request, following redirects, with a 10s timeout.
     *
     * @param url - The URL to fetch.
     * @param headers - Optional request headers.
     * @returns Response body as a string, or undefined on error/non-200.
     */
    private _httpGet(url: string, headers?: Record<string, string>): Promise<string | undefined> {
        return new Promise((resolve) => {
            const reqHeaders: Record<string, string> = {
                'User-Agent': 'ansible-environments-mcp',
                ...headers,
            };

            const req = https.get(url, { headers: reqHeaders }, (res) => {
                if (
                    res.statusCode &&
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    void this._httpGet(res.headers.location, headers).then(resolve);
                    return;
                }

                const isAuthRetryable =
                    headers?.Authorization &&
                    (res.statusCode === 401 ||
                        (res.statusCode === 404 && url.includes('raw.githubusercontent.com')));
                if (isAuthRetryable) {
                    _markTokenRejected();
                    const rest = Object.fromEntries(
                        Object.entries(headers).filter(([k]) => k !== 'Authorization'),
                    );
                    void this._httpGet(url, Object.keys(rest).length > 0 ? rest : undefined).then(
                        resolve,
                    );
                    return;
                }

                if (res.statusCode !== 200) {
                    log(`SkillRegistry: HTTP ${String(res.statusCode)} for ${url}`);
                    resolve(undefined);
                    return;
                }

                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve(Buffer.concat(chunks).toString('utf-8'));
                });
                res.on('error', () => {
                    resolve(undefined);
                });
            });

            req.on('error', (err) => {
                log(`SkillRegistry: request error for ${url}: ${String(err)}`);
                resolve(undefined);
            });
            req.setTimeout(10000, () => {
                log(`SkillRegistry: request timeout for ${url}`);
                req.destroy();
                resolve(undefined);
            });
        });
    }

    // -- Private: disk cache ------------------------------------------------

    /**
     * Returns the cache file path for a given source.
     *
     * @param sourceId - Unique source identifier.
     * @returns Absolute path to the cache JSON file.
     */
    private _getCachePath(sourceId: string): string {
        return path.join(CACHE_DIR, `${sourceId}-${INDEX_CACHE_FILE}`);
    }

    /**
     * Reads a cached skill index from disk.
     *
     * @param sourceId - Source to read cached data for.
     * @returns Parsed cached index, or undefined when not available.
     */
    private _readCache(sourceId: string): CachedIndex | undefined {
        try {
            const cachePath = this._getCachePath(sourceId);
            if (!fs.existsSync(cachePath)) {
                return undefined;
            }
            const raw = fs.readFileSync(cachePath, 'utf-8');
            return JSON.parse(raw) as CachedIndex;
        } catch {
            return undefined;
        }
    }

    /**
     * Persists a skill index to disk, stripping content to save space.
     *
     * @param sourceId - Source identifier for the cache file.
     * @param skills - Skills to persist.
     * @param format - Detected repo format.
     * @param sourceUrl - Source URL stored for cache invalidation.
     */
    private _writeCache(
        sourceId: string,
        skills: SkillEntry[],
        format?: RepoFormat,
        sourceUrl?: string,
    ): void {
        try {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            const data: CachedIndex = {
                timestamp: Date.now(),
                sourceId,
                sourceUrl,
                format,
                skills: skills.map((s) => ({
                    ...s,
                    content: undefined,
                    contentUrl: s.contentUrl,
                })),
            };
            fs.writeFileSync(this._getCachePath(sourceId), JSON.stringify(data));
        } catch (err: unknown) {
            log(`SkillRegistry: failed to write cache for ${sourceId}: ${String(err)}`);
        }
    }
}
