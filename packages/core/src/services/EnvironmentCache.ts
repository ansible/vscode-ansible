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
 * Get the workspace root directory
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
 * Get the cache file path
 */
function getCacheFilePath(): string | null {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return null;
    }
    return path.join(workspaceRoot, CACHE_DIR, CACHE_FILE);
}

/**
 * Ensure the cache directory exists
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
 * Read the cache file
 */
function readCache(): CacheFile | null {
    const cachePath = getCacheFilePath();
    if (!cachePath) {
        return null;
    }
    
    try {
        if (fs.existsSync(cachePath)) {
            const content = fs.readFileSync(cachePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('Failed to read environment cache:', error);
    }
    
    return null;
}

/**
 * Write to the cache file
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
 * Save the selected environment to cache (called from VS Code extension)
 */
export function cacheSelectedEnvironment(
    pythonPath: string,
    displayName?: string
): boolean {
    const binDir = path.dirname(pythonPath);
    
    const cache: CacheFile = {
        selectedEnvironment: {
            pythonPath,
            binDir,
            displayName,
            timestamp: new Date().toISOString()
        }
    };
    
    const success = writeCache(cache);
    if (success) {
        console.error(`Environment cached: ${pythonPath}`);
    }
    return success;
}

/**
 * Get the cached environment (called from standalone MCP server)
 */
export function getCachedEnvironment(): CachedEnvironment | null {
    const cache = readCache();
    return cache?.selectedEnvironment || null;
}

/**
 * Get the bin directory for tools (ansible-doc, etc.)
 * Returns cached environment's bin dir, or null if not cached
 */
export function getCachedBinDir(): string | null {
    const env = getCachedEnvironment();
    return env?.binDir || null;
}

/**
 * Get path to a tool in the cached environment
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
 * Clear the cached environment
 */
export function clearCachedEnvironment(): boolean {
    const cache = readCache() || {};
    delete cache.selectedEnvironment;
    return writeCache(cache);
}

/**
 * Find an executable - first checks cached environment, then PATH
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
 * Find an executable in PATH
 */
async function findInPath(name: string): Promise<string | null> {
    const { exec } = await import('child_process');
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `where ${name}` : `which ${name}`;
    
    return new Promise((resolve) => {
        exec(cmd, (error, stdout) => {
            if (error) {
                resolve(null);
            } else {
                resolve(stdout.trim().split('\n')[0]);
            }
        });
    });
}
