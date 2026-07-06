/**
 * Environment Cache
 *
 * Caches the selected Python environment to a file so standalone tools
 * (like the MCP server) can find it without VS Code.
 */

import * as fs from 'fs';
import * as path from 'path';

// Conditional vscode import
let vscode: typeof import('vscode') | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- conditional require for VS Code-optional usage
    vscode = require('vscode');
} catch {
    // Running standalone
}

export interface CachedEnvironment {
    pythonPath: string;
    binDir: string;
    displayName?: string;
    timestamp: string;
}

interface CacheFile {
    selectedEnvironment?: CachedEnvironment;
}

const CACHE_DIR = '.cache/ansible-environments';
const CACHE_FILE = 'environment.json';

/**
 * Resolves the workspace root from VS Code, ANSIBLE_ENV_WORKSPACE, or cwd.
 *
 * @returns Absolute workspace path, or null when no root can be determined.
 */
function getWorkspaceRoot(): string | null {
    if (vscode?.workspace.workspaceFolders?.[0]) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    // Standalone (MCP server): use ANSIBLE_ENV_WORKSPACE env var, or fall back to cwd
    if (process.env.ANSIBLE_ENV_WORKSPACE) {
        return process.env.ANSIBLE_ENV_WORKSPACE;
    }
    return process.cwd();
}

/**
 * Builds the path to the environment cache file for the current workspace.
 *
 * @returns Absolute cache file path, or null when no workspace root exists.
 */
function getCacheFilePath(): string | null {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return null;
    }
    return path.join(workspaceRoot, CACHE_DIR, CACHE_FILE);
}

/**
 * Creates the cache directory under the workspace when it is missing.
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
 * Reads and parses the environment cache file from disk.
 *
 * @returns Parsed cache contents, or null when the file is missing or unreadable.
 */
function readCache(): CacheFile | null {
    const cachePath = getCacheFilePath();
    if (!cachePath) {
        return null;
    }

    try {
        if (fs.existsSync(cachePath)) {
            const content = fs.readFileSync(cachePath, 'utf8');
            return JSON.parse(content) as CacheFile;
        }
    } catch (error) {
        console.error('Failed to read environment cache:', error);
    }

    return null;
}

/**
 * Persists cache data to the workspace environment cache file.
 *
 * @param cache - Cache payload to write.
 * @returns True when the file was written successfully.
 */
function writeCache(cache: CacheFile): boolean {
    if (!ensureCacheDir()) {
        return false;
    }

    const cachePath = getCacheFilePath();
    if (!cachePath) {
        return false;
    }

    try {
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Failed to write environment cache:', error);
        return false;
    }
}

/**
 * Saves the selected Python environment to the workspace cache (VS Code extension).
 *
 * @param pythonPath - Absolute path to the Python interpreter.
 * @param displayName - Optional human-readable environment label.
 * @returns True when the cache file was written successfully.
 */
export function cacheSelectedEnvironment(pythonPath: string, displayName?: string): boolean {
    const binDir = path.dirname(pythonPath);

    const cache: CacheFile = {
        selectedEnvironment: {
            pythonPath,
            binDir,
            displayName,
            timestamp: new Date().toISOString(),
        },
    };

    const success = writeCache(cache);
    if (success) {
        console.error(`Environment cached: ${pythonPath}`);
    }
    return success;
}

/**
 * Returns the cached Python environment (used by the standalone MCP server).
 *
 * @returns Cached environment metadata, or null when no selection is stored.
 */
export function getCachedEnvironment(): CachedEnvironment | null {
    const cache = readCache();
    return cache?.selectedEnvironment ?? null;
}

/**
 * Returns the bin directory from the cached environment for tool resolution.
 *
 * @returns Absolute bin directory path, or null when no environment is cached.
 */
export function getCachedBinDir(): string | null {
    const env = getCachedEnvironment();
    return env?.binDir ?? null;
}

/**
 * Resolves an executable within the cached environment's bin directory.
 *
 * @param toolName - Executable name to look up (e.g. ansible-doc).
 * @returns Absolute tool path when it exists in the cached bin dir, otherwise null.
 */
export function getCachedToolPath(toolName: string): string | null {
    const binDir = getCachedBinDir();
    if (!binDir) {
        return null;
    }

    const toolPath = path.join(binDir, toolName);
    if (fs.existsSync(toolPath)) {
        return toolPath;
    }

    return null;
}

/**
 * Removes the selected environment entry from the workspace cache.
 *
 * @returns True when the updated cache was written successfully.
 */
export function clearCachedEnvironment(): boolean {
    const cache = readCache() ?? {};
    delete cache.selectedEnvironment;
    return writeCache(cache);
}

/**
 * Locates an executable in the cached environment bin dir, then on PATH.
 *
 * @param name - Executable name to resolve.
 * @returns Absolute path to the executable, or null when not found.
 */
export async function findExecutableWithCache(name: string): Promise<string | null> {
    // First try cached environment
    const cachedPath = getCachedToolPath(name);
    if (cachedPath) {
        return cachedPath;
    }

    // Fall back to PATH
    return findInPath(name);
}

/**
 * Locates an executable using the system which/where command.
 *
 * @param name - Executable name to search for on PATH.
 * @returns Absolute path to the first match, or null when not found.
 */
async function findInPath(name: string): Promise<string | null> {
    const { execFile } = await import('child_process');
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where' : 'which';

    return new Promise((resolve) => {
        execFile(cmd, [name], (error, stdout) => {
            if (error) {
                resolve(null);
            } else {
                resolve(stdout.trim().split('\n')[0]);
            }
        });
    });
}
