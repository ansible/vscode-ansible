// Conditional vscode import - only used when available
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone (not in VS Code)
}

import * as fs from 'fs';
import * as path from 'path';

import { SimpleEventEmitter } from '../utils/SimpleEventEmitter';
import { EECache } from './EECache';
import * as ContainerRuntime from './ContainerRuntime';
import type { ContainerEngine, InspectedImage } from './ContainerRuntime';

/**
 * Information about an execution environment container image.
 */
export interface ExecutionEnvironment {
    created: string;
    execution_environment: boolean;
    full_name: string;
    image_id: string;
}

/**
 * Detailed information about an execution environment.
 */
export interface EEDetails {
    ansible_collections?: {
        details: Record<string, string>;
    };
    ansible_version?: {
        details: string;
    };
    redhat_release?: {
        details: string;
    };
    system_packages?: {
        details: Record<string, string>[];
    };
    python_packages?: {
        details: {
            name: string;
            version: string;
            summary?: string;
        }[];
    };
    os_release?: {
        details: {
            'pretty-name'?: string;
            name?: string;
            version?: string;
        }[];
    };
    image_name?: string;
}

/**
 * Service for managing Ansible Execution Environments.
 *
 * Uses ContainerRuntime (TypeScript) for host-side image discovery and
 * a vendored Python script for in-container introspection. No Python
 * or ansible-navigator needed on the host.
 *
 * Introspection results are cached on disk keyed by image SHA for
 * instant subsequent lookups, even across process restarts.
 */
export class ExecutionEnvService {
    private static _instance: ExecutionEnvService | undefined;
    private _executionEnvironments: ExecutionEnvironment[] = [];
    private _inspectedImages = new Map<string, InspectedImage>();
    private _memoryCache = new Map<string, EEDetails>();
    private _fileCache: EECache;
    private _engine: ContainerEngine | null = null;
    private _scriptCacheDir: string | null = null;
    private _loading = false;
    private _loadingPromise: Promise<ExecutionEnvironment[]> | null = null;
    private _loaded = false;
    private _onDidChange: SimpleEventEmitter<void> | { fire: () => void; event: unknown };
    public readonly onDidChange: unknown;
    private _logFn: (message: string) => void = console.error;

    /** Create the singleton service, initializing the file cache and event emitters. */
    private constructor() {
        this._fileCache = new EECache();

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
     * Get the singleton instance.
     *
     * @returns The shared ExecutionEnvService instance.
     */
    public static getInstance(): ExecutionEnvService {
        ExecutionEnvService._instance ??= new ExecutionEnvService();
        return ExecutionEnvService._instance;
    }

    /**
     * Check if running in VS Code.
     *
     * @returns True when the vscode module is available.
     */
    public isInVSCode(): boolean {
        return vscode !== undefined;
    }

    /**
     * Set a custom logging function.
     *
     * @param fn - Callback invoked for ExecutionEnvService diagnostic messages.
     */
    public setLogFunction(fn: (message: string) => void): void {
        this._logFn = fn;
    }

    /**
     * @param message - Diagnostic message to emit.
     */
    private _log(message: string): void {
        this._logFn(`ExecutionEnvService: ${message}`);
    }

    /**
     * Check if the service is currently loading data.
     *
     * @returns True while container image discovery is in progress.
     */
    public isLoading(): boolean {
        return this._loading;
    }

    /**
     * Check if the service has loaded data.
     *
     * @returns True after execution environments are loaded at least once.
     */
    public isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * Get all loaded execution environments.
     *
     * @returns Container images flagged as execution environments.
     */
    public getExecutionEnvironments(): ExecutionEnvironment[] {
        return this._executionEnvironments;
    }

    /**
     * Get a specific execution environment by name.
     *
     * @param fullName - Full image name (repository:tag).
     * @returns Matching environment metadata, or undefined when not loaded.
     */
    public getExecutionEnvironment(fullName: string): ExecutionEnvironment | undefined {
        return this._executionEnvironments.find((ee) => ee.full_name === fullName);
    }

    /**
     * Get cached details for an execution environment.
     *
     * @param fullName - Full image name to look up in the details cache.
     * @returns Cached inspection details, or undefined when not yet loaded.
     */
    public getCachedDetails(fullName: string): EEDetails | undefined {
        return this._memoryCache.get(fullName);
    }

    /**
     * Clears in-memory execution environment data and signals consumers to reload.
     *
     * @returns Promise that resolves after caches are cleared and listeners notified.
     */
    public refresh(): Promise<void> {
        this._executionEnvironments = [];
        this._inspectedImages.clear();
        this._memoryCache.clear();
        this._loaded = false;
        (this._onDidChange as { fire: () => void }).fire();
        return Promise.resolve();
    }

    /**
     * Force refresh details for a specific image (or all).
     * Clears both file and memory caches for the given image.
     *
     * @param fullName - Image to refresh, or omit for all.
     */
    public forceRefresh(fullName?: string): void {
        if (fullName) {
            this._memoryCache.delete(fullName);
            const ee = this._executionEnvironments.find((e) => e.full_name === fullName);
            if (ee) {
                this._fileCache.remove(ee.image_id);
            }
        } else {
            this._memoryCache.clear();
            this._fileCache.clear();
        }
        this._executionEnvironments = [];
        this._inspectedImages.clear();
        this._loaded = false;
        (this._onDidChange as { fire: () => void }).fire();
    }

    /**
     * Ensure we have a container engine detected.
     *
     * @returns The detected container engine.
     */
    private async _ensureEngine(): Promise<ContainerEngine> {
        this._engine ??= await ContainerRuntime.detectEngine();
        if (!this._engine) {
            throw new Error(
                'No container engine found. Install podman or docker to use Execution Environments.',
            );
        }
        return this._engine;
    }

    /**
     * Ensure vendored scripts are deployed to the cache directory.
     *
     * @returns Path to the cache directory containing deployed scripts.
     */
    private _ensureScripts(): string {
        if (!this._scriptCacheDir) {
            const target = 'image_introspect.py';

            // Fast path: scripts already deployed to XDG cache from a prior run.
            const cacheDir = ContainerRuntime.getScriptCacheDir();
            if (cacheDir && existsSync(path.join(cacheDir, target))) {
                this._scriptCacheDir = cacheDir;
                return this._scriptCacheDir;
            }

            // __dirname varies by context: tsc output (packages/core/out/services),
            // esbuild bundle (dist/), Electron asar, etc.  Try multiple candidate
            // paths to locate the vendored source files for initial deployment.
            const candidates = [
                // tsc: __dirname = packages/core/out/services
                path.resolve(__dirname, '..', 'data'),
                path.resolve(__dirname, '..', 'src', 'data'),
                // esbuild: __dirname = dist/  (one level below repo root)
                path.resolve(__dirname, '..', 'packages', 'core', 'src', 'data'),
                path.resolve(__dirname, '..', 'packages', 'core', 'data'),
                // deeper nesting (Electron asar, etc.)
                path.resolve(__dirname, '..', '..', 'packages', 'core', 'src', 'data'),
                path.resolve(__dirname, '..', '..', 'packages', 'core', 'data'),
                path.resolve(__dirname, '..', '..', 'data'),
                path.resolve(__dirname, '..', '..', 'src', 'data'),
            ];

            const dataDir = candidates.find((dir) => existsSync(path.join(dir, target)));

            if (!dataDir) {
                throw new Error(
                    `Vendored introspection scripts not found. Searched:\n${candidates.join('\n')}`,
                );
            }
            this._scriptCacheDir = ContainerRuntime.deployScripts(dataDir);
        }
        return this._scriptCacheDir;
    }

    /**
     * Load execution environments by querying the local container engine.
     *
     * @returns Filtered list of images marked as execution environments.
     */
    public async loadExecutionEnvironments(): Promise<ExecutionEnvironment[]> {
        if (this._loadingPromise) {
            return this._loadingPromise;
        }

        if (this._loaded && this._executionEnvironments.length > 0) {
            return this._executionEnvironments;
        }

        this._loading = true;
        (this._onDidChange as { fire: () => void }).fire();

        this._loadingPromise = this._doLoadExecutionEnvironments();
        try {
            return await this._loadingPromise;
        } finally {
            this._loadingPromise = null;
        }
    }

    /**
     * Internal implementation of EE loading.
     *
     * @returns Filtered list of images marked as execution environments.
     */
    private async _doLoadExecutionEnvironments(): Promise<ExecutionEnvironment[]> {
        try {
            const engine = await this._ensureEngine();
            const images = await ContainerRuntime.listImages(engine);

            const inspected = await Promise.all(
                images.map((img) => ContainerRuntime.inspectImage(engine, img)),
            );

            const ees: ExecutionEnvironment[] = [];
            for (const img of inspected) {
                this._inspectedImages.set(`${img.repository}:${img.tag}`, img);
                if (img.executionEnvironment) {
                    ees.push({
                        created: img.created,
                        execution_environment: true,
                        full_name: `${img.repository}:${img.tag}`,
                        image_id: img.id,
                    });
                }
            }

            this._executionEnvironments = ees;
            this._loaded = true;
            this._log(`Loaded ${String(ees.length)} execution environments`);

            const currentShas = new Set(inspected.map((img) => img.id));
            this._fileCache.prune(currentShas);

            return this._executionEnvironments;
        } catch (error) {
            this._log(
                `Error loading execution environments: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        } finally {
            this._loading = false;
            (this._onDidChange as { fire: () => void }).fire();
        }
    }

    /**
     * Load detailed information for a specific execution environment.
     * Checks: memory cache -> file cache (by SHA) -> live introspection.
     *
     * @param fullName - Full image name to inspect.
     * @returns Parsed inspection details, or null when introspection yields no output.
     */
    public async loadDetails(fullName: string): Promise<EEDetails | null> {
        const memCached = this._memoryCache.get(fullName);
        if (memCached) {
            return memCached;
        }

        // Ensure we have the EE list so we can resolve the image SHA for
        // disk-cache lookup. Without this, direct callers (e.g. MCP handler)
        // would bypass the file cache entirely.
        if (!this._loaded) {
            await this.loadExecutionEnvironments();
        }

        const ee = this._executionEnvironments.find((e) => e.full_name === fullName);
        let sha = ee?.image_id;

        // If the image isn't in the EE list (e.g. user passed an arbitrary
        // name), try to resolve its SHA via a single inspect call.
        if (!sha) {
            try {
                const engine = await this._ensureEngine();
                const images = await ContainerRuntime.listImages(engine);
                const match = images.find((img) => `${img.repository}:${img.tag}` === fullName);
                if (match) {
                    sha = match.id;
                }
            } catch {
                this._log(`Could not resolve SHA for ${fullName}, skipping disk cache`);
            }
        }

        if (sha) {
            const fileCached = this._fileCache.get(sha);
            if (fileCached) {
                this._memoryCache.set(fullName, fileCached);
                this._log(`Cache hit (file) for ${fullName} [${sha.substring(0, 12)}]`);
                return fileCached;
            }
        }

        try {
            const engine = await this._ensureEngine();
            const cacheDir = this._ensureScripts();
            const stdout = await ContainerRuntime.runInContainer(engine, fullName, cacheDir);

            if (!stdout) {
                return null;
            }

            const rawDetails = JSON.parse(stdout) as Record<string, unknown>;
            const details = this._normalizeIntrospectionOutput(rawDetails, fullName);

            this._memoryCache.set(fullName, details);
            if (sha) {
                this._fileCache.set(sha, fullName, details);
                this._log(`Cached introspection for ${fullName} [${sha.substring(0, 12)}]`);
            }

            return details;
        } catch (error) {
            this._log(
                `Failed to load EE details for ${fullName}: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        }
    }

    /**
     * Normalize the raw introspection script output into the EEDetails shape
     * expected by consumers (extension, MCP server, Studio).
     *
     * @param raw - Raw JSON output from the vendored introspection script.
     * @param imageName - Full image name to attach to the result.
     * @returns Normalized EEDetails with only the `details` payload per section.
     */
    private _normalizeIntrospectionOutput(
        raw: Record<string, unknown>,
        imageName: string,
    ): EEDetails {
        const details: EEDetails = { image_name: imageName };

        const sections = [
            'ansible_collections',
            'ansible_version',
            'os_release',
            'redhat_release',
            'python_packages',
            'system_packages',
        ];

        for (const key of sections) {
            const section = raw[key] as Record<string, unknown> | undefined;
            if (section?.details !== undefined) {
                (details as Record<string, unknown>)[key] = { details: section.details };
            }
        }

        return details;
    }

    /**
     * Get Ansible collections installed in an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Sorted collection name and version pairs from EE details.
     */
    public async getCollections(fullName: string): Promise<{ name: string; version: string }[]> {
        const details = await this.loadDetails(fullName);
        if (!details?.ansible_collections?.details) {
            return [];
        }

        return Object.entries(details.ansible_collections.details)
            .map(([name, version]) => ({ name, version }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get Python packages installed in an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Sorted Python package entries from EE details.
     */
    public async getPythonPackages(
        fullName: string,
    ): Promise<{ name: string; version: string; summary?: string }[]> {
        const details = await this.loadDetails(fullName);
        if (!details?.python_packages?.details) {
            return [];
        }

        return [...details.python_packages.details].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get system packages installed in an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Sorted system package name and version pairs from EE details.
     */
    public async getSystemPackages(fullName: string): Promise<{ name: string; version: string }[]> {
        const details = await this.loadDetails(fullName);
        if (!details?.system_packages?.details) {
            return [];
        }

        return details.system_packages.details
            .map((pkg) => ({
                name: pkg.name,
                version: pkg.version ? `${pkg.version}-${pkg.release}` : '',
            }))
            .filter((pkg) => pkg.name !== '')
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get OS and Ansible version info for an execution environment.
     *
     * @param fullName - Full image name to inspect.
     * @returns Summary of Ansible version, OS name, and image name when available.
     */
    public async getInfo(
        fullName: string,
    ): Promise<{ ansible?: string; os?: string; image?: string }> {
        const details = await this.loadDetails(fullName);
        if (!details) {
            return {};
        }

        const info: { ansible?: string; os?: string; image?: string } = {};

        if (details.ansible_version?.details) {
            info.ansible = details.ansible_version.details;
        }

        if (details.os_release?.details[0]) {
            const osInfo = details.os_release.details[0];
            info.os = osInfo['pretty-name'] ?? osInfo.name ?? 'Unknown';
        }

        if (details.image_name) {
            info.image = details.image_name;
        }

        return info;
    }
}

/**
 * Check whether a filesystem path exists synchronously.
 *
 * @param p - Path to check.
 * @returns True when the path is accessible.
 */
function existsSync(p: string): boolean {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}
