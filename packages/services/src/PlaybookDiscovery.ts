import * as fs from 'fs';
import * as path from 'path';
import { parsePlaybook, log } from '@ansible/common';
import type { PlaybookPlay } from '@ansible/common';

export interface DiscoveredPlaybook {
    name: string;
    path: string;
    relativePath: string;
    plays: PlaybookPlay[];
}

const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    '.venv',
    'venv',
    '.tox',
    '__pycache__',
    'artifacts',
    'collections',
]);

const ROLE_INTERNAL_DIRS = new Set([
    'tasks',
    'handlers',
    'defaults',
    'vars',
    'meta',
    'templates',
    'files',
]);

/**
 * Walk a directory tree to discover Ansible playbook files.
 *
 * Uses content-based validation via `parsePlaybook()` — only YAML files
 * whose top-level structure is a list of plays are returned. This avoids
 * false positives from role task files, variable files, and other YAML.
 *
 * @param rootDir - Workspace root to scan
 * @returns Array of discovered playbooks with parsed play metadata
 */
export async function discoverPlaybooks(rootDir: string): Promise<DiscoveredPlaybook[]> {
    const results: DiscoveredPlaybook[] = [];
    await walkDir(rootDir, rootDir, results, false);
    log(`PlaybookDiscovery: found ${String(results.length)} playbooks in ${rootDir}`);
    return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Recursively walk a directory, parsing YAML files and appending valid playbooks to results.
 * Skips role-internal directories entirely to avoid unnecessary I/O in large workspaces.
 * @param dir - Current directory being scanned
 * @param rootDir - Workspace root for computing relative paths
 * @param results - Accumulator for discovered playbooks
 * @param insideRole - Whether the current path is inside a roles/<name>/ directory
 */
async function walkDir(
    dir: string,
    rootDir: string,
    results: DiscoveredPlaybook[],
    insideRole: boolean,
): Promise<void> {
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
                continue;
            }
            if (insideRole && ROLE_INTERNAL_DIRS.has(entry.name)) {
                continue;
            }
            const enteringRole = entry.name === 'roles' || insideRole;
            await walkDir(fullPath, rootDir, results, enteringRole);
            continue;
        }

        if (!entry.isFile() || !/\.(yml|yaml)$/i.test(entry.name)) {
            continue;
        }

        try {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            const plays = parsePlaybook(content);

            if (plays.length > 0) {
                const relativePath = path.relative(rootDir, fullPath);
                results.push({
                    name: path.basename(fullPath, path.extname(fullPath)),
                    path: fullPath,
                    relativePath,
                    plays,
                });
            }
        } catch {
            // Skip unreadable files
        }
    }
}
