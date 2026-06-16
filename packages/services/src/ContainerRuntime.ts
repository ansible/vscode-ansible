/**
 * Container Runtime
 *
 * Host-side TypeScript replacement for ansible-navigator's image discovery.
 * Detects podman/docker, lists and inspects images, classifies EEs,
 * and runs the vendored introspection script inside containers.
 *
 * Zero Python required on the host -- the introspection script runs
 * exclusively inside EE containers using the container's own Python.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getCommandService } from './CommandService';
import type { ExecResult } from '@ansible/common';
import { log } from '@ansible/common';

export type ContainerEngine = 'podman' | 'docker';

/** Normalized image record from `{engine} images --format json`. */
export interface ContainerImage {
    id: string;
    repository: string;
    tag: string;
    created: string;
    size: string;
    names: string[];
}

/** Result of `{engine} inspect` with EE classification. */
export interface InspectedImage extends ContainerImage {
    executionEnvironment: boolean;
    inspect: {
        config: {
            labels: Record<string, string>;
            workingDir: string;
        };
        architecture?: string;
        os?: string;
    };
}

// ── Raw JSON shapes from podman / docker ────────────────────────────

interface PodmanImageJson {
    Id: string;
    Names: string[] | null;
    Created?: string;
    CreatedAt?: string;
    Size?: number;
}

interface DockerImageJson {
    ID: string;
    Repository: string;
    Tag: string;
    CreatedAt: string;
    Size: string;
}

interface InspectJson {
    Id?: string;
    Config?: {
        Labels?: Record<string, string>;
        WorkingDir?: string;
    };
    Architecture?: string;
    Os?: string;
    [key: string]: unknown;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Detect which container engine is available (prefers podman).
 *
 * @returns The detected engine name, or null if neither is found.
 */
export async function detectEngine(): Promise<ContainerEngine | null> {
    const cmd = getCommandService();
    for (const engine of ['podman', 'docker'] as const) {
        const result = await cmd.runCommand(`${engine} --version`);
        if (result.exitCode === 0) {
            log(`ContainerRuntime: detected ${engine}`);
            return engine;
        }
    }
    log('ContainerRuntime: no container engine found');
    return null;
}

/**
 * List all local container images.
 * Uses `--format json` for both podman and docker (no tabular parsing).
 *
 * @param engine - Container engine to invoke.
 * @returns Normalized image records.
 */
export async function listImages(engine: ContainerEngine): Promise<ContainerImage[]> {
    const cmd = getCommandService();
    let result: ExecResult;

    if (engine === 'podman') {
        result = await cmd.runCommand(`${engine} images --format json`);
    } else {
        result = await cmd.runCommand(`${engine} images --format "{{json .}}" --no-trunc`);
    }

    if (result.exitCode !== 0 || !result.stdout) {
        log(`ContainerRuntime: ${engine} images failed: ${result.stderr}`);
        return [];
    }

    return engine === 'podman'
        ? parsePodmanImages(result.stdout)
        : parseDockerImages(result.stdout);
}

/**
 * Run `{engine} inspect` on a single image and classify whether it's an EE.
 *
 * @param engine - Container engine to invoke.
 * @param image - Image to inspect.
 * @returns The image with EE classification and inspect metadata.
 */
export async function inspectImage(
    engine: ContainerEngine,
    image: ContainerImage,
): Promise<InspectedImage> {
    const cmd = getCommandService();
    const result = await cmd.runCommand(`${engine} inspect ${image.id}`);

    let inspectData: InspectJson = {};
    if (result.exitCode === 0 && result.stdout) {
        try {
            const parsed: unknown = JSON.parse(result.stdout);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            inspectData = (arr[0] as InspectJson | undefined) ?? {};
        } catch {
            log(`ContainerRuntime: failed to parse inspect JSON for ${image.id}`);
        }
    }

    const config = inspectData.Config ?? {};
    const labels = config.Labels ?? {};
    const workingDir = config.WorkingDir ?? '';

    return {
        ...image,
        executionEnvironment: classifyEE(labels, workingDir),
        inspect: {
            config: { labels, workingDir },
            architecture: inspectData.Architecture,
            os: inspectData.Os,
        },
    };
}

/**
 * Determine if an image is an Ansible Execution Environment.
 * Matches navigator's three-way check:
 *   1. Label `ansible-execution-environment` = "true" (root level)
 *   2. Label in Config.Labels
 *   3. Legacy: WorkingDir = "/runner"
 * @param labels - Image labels from container inspect.
 * @param workingDir - Container working directory from inspect.
 * @returns True when the image qualifies as an EE.
 */
export function classifyEE(labels: Record<string, string>, workingDir: string): boolean {
    const labelCheck = labels['ansible-execution-environment'] === 'true';
    const legacyCheck = workingDir === '/runner';
    return labelCheck || legacyCheck;
}

/**
 * Run the vendored introspection script inside a container.
 * Uses execFile (no shell) to prevent injection via imageName.
 *
 * @param engine - Container engine to use.
 * @param imageName - Full image name (repository:tag).
 * @param cacheDir - Directory where the vendored scripts are deployed.
 * @param sections - Optional list of sections to collect.
 * @returns Raw JSON string from the introspection script.
 */
export async function runInContainer(
    engine: ContainerEngine,
    imageName: string,
    cacheDir: string,
    sections?: string[],
): Promise<string> {
    const cmd = getCommandService();

    const scriptPath = path.join(cacheDir, 'image_introspect.py');
    const pythonWrapper = path.join(cacheDir, 'python_latest.sh');

    const args = ['run', '--rm', '--pull=never', '-v', `${cacheDir}:${cacheDir}:Z`];

    if (engine === 'podman') {
        args.push('--user=root');
    }

    args.push(imageName, pythonWrapper, scriptPath);

    if (sections?.length) {
        args.push('--sections', ...sections);
    }

    log(`ContainerRuntime: introspecting ${imageName}`);

    const result = await cmd.runCommandArgs(engine, args, { timeout: 120_000 });

    if (result.exitCode !== 0) {
        log(`ContainerRuntime: introspection failed for ${imageName}: ${result.stderr}`);
        throw new Error(`Introspection failed for ${imageName}: ${result.stderr}`);
    }

    return result.stdout;
}

/**
 * Get the XDG-compliant cache directory for vendored scripts.
 *
 * @returns Absolute path to the cache directory.
 */
export function getScriptCacheDir(): string {
    const xdgCache = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
    return path.join(xdgCache, 'ansible-tools');
}

/**
 * Deploy the vendored scripts to the cache directory so they can be
 * volume-mounted into containers.
 *
 * @param dataDir - The directory containing the vendored .py and .sh source files.
 * @returns The cache directory path where scripts were deployed.
 */
export function deployScripts(dataDir: string): string {
    const cacheDir = getScriptCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });

    for (const file of ['image_introspect.py', 'python_latest.sh']) {
        const src = path.join(dataDir, file);
        const dst = path.join(cacheDir, file);

        // Only copy if source is newer or destination doesn't exist
        const srcStat = fs.statSync(src);
        let needsCopy = true;
        try {
            const dstStat = fs.statSync(dst);
            needsCopy = srcStat.mtimeMs > dstStat.mtimeMs;
        } catch {
            // destination doesn't exist
        }

        if (needsCopy) {
            fs.copyFileSync(src, dst);
            // Ensure scripts are executable
            fs.chmodSync(dst, 0o755);
            log(`ContainerRuntime: deployed ${file} to ${cacheDir}`);
        }
    }

    return cacheDir;
}

// ── Parsers (engine-specific JSON normalization) ────────────────────

/**
 * Parse podman's `--format json` array output into normalized images.
 *
 * @param stdout - Raw JSON stdout from `podman images --format json`.
 * @returns Normalized image records.
 */
function parsePodmanImages(stdout: string): ContainerImage[] {
    let raw: PodmanImageJson[];
    try {
        raw = JSON.parse(stdout) as PodmanImageJson[];
    } catch {
        log('ContainerRuntime: failed to parse podman images JSON');
        return [];
    }

    const images: ContainerImage[] = [];
    for (const entry of raw) {
        const names = entry.Names ?? [];
        if (names.length === 0) continue;

        // Each name is "repository:tag" -- one entry per name
        for (const fullName of names) {
            const lastColon = fullName.lastIndexOf(':');
            const repo = lastColon > 0 ? fullName.substring(0, lastColon) : fullName;
            const tag = lastColon > 0 ? fullName.substring(lastColon + 1) : 'latest';
            if (tag === '<none>') continue;

            images.push({
                id: entry.Id,
                repository: repo,
                tag,
                created: entry.CreatedAt ?? entry.Created ?? '',
                size: entry.Size != null ? formatBytes(entry.Size) : '',
                names: [fullName],
            });
        }
    }
    return images;
}

/**
 * Parse docker's line-delimited `{{json .}}` output into normalized images.
 *
 * @param stdout - Raw per-line JSON stdout from `docker images`.
 * @returns Normalized image records.
 */
function parseDockerImages(stdout: string): ContainerImage[] {
    // Docker with `--format "{{json .}}"` outputs one JSON object per line
    const images: ContainerImage[] = [];
    for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const entry = JSON.parse(trimmed) as DockerImageJson;
            if (entry.Tag === '<none>' || entry.Repository === '<none>') continue;
            const fullName = `${entry.Repository}:${entry.Tag}`;
            images.push({
                id: entry.ID,
                repository: entry.Repository,
                tag: entry.Tag,
                created: entry.CreatedAt,
                size: entry.Size,
                names: [fullName],
            });
        } catch {
            // skip malformed lines
        }
    }
    return images;
}

/**
 * Format a byte count into a human-readable string.
 *
 * @param bytes - Number of bytes.
 * @returns Formatted string like "1.2 GB".
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(1)} ${units[i]}`;
}
