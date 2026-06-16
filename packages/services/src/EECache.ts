/**
 * EE Image Cache
 *
 * SHA-keyed file-based cache for Execution Environment introspection data.
 * Cache key is the container image's content digest (SHA) which guarantees:
 *   - Natural invalidation: new image content = new SHA = cache miss
 *   - Deduplication: multiple tags pointing to the same SHA share one entry
 *   - Persistence across process restarts
 *
 * Cache location: $XDG_CACHE_HOME/ansible-tools/ee-cache/
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { EEDetails } from '@ansible/common';
import { log } from '@ansible/common';

/** Metadata stored in the cache index for each image SHA. */
export interface CacheIndexEntry {
    fullName: string;
    tag: string;
    introspectedAt: string;
}

/** Maps image SHA to its cache index entry. */
export type CacheIndex = Record<string, CacheIndexEntry>;

/** File-based cache for EE introspection data, keyed by image SHA. */
export class EECache {
    private _cacheDir: string;
    private _index: CacheIndex = {};

    /**
     * @param cacheDir - Override cache directory (defaults to XDG_CACHE_HOME).
     */
    constructor(cacheDir?: string) {
        const xdgCache = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
        this._cacheDir = cacheDir ?? path.join(xdgCache, 'ansible-tools', 'ee-cache');
        this._ensureDir();
        this._loadIndex();
    }

    /**
     * Normalize SHA for use as a cache file name by stripping the algo prefix.
     *
     * @param sha - Full image SHA (e.g. "sha256:abc123...").
     * @returns Full hex digest with the `sha256:` prefix stripped.
     */
    private _normalizedSha(sha: string): string {
        return sha.replace(/^sha256:/, '');
    }

    /**
     * @returns Absolute path to the index.json file.
     */
    private _indexPath(): string {
        return path.join(this._cacheDir, 'index.json');
    }

    /**
     * @param sha - Image SHA to resolve.
     * @returns Absolute path to the per-image detail JSON file.
     */
    private _detailPath(sha: string): string {
        return path.join(this._cacheDir, `${this._normalizedSha(sha)}.json`);
    }

    /** Create the cache directory if it does not exist. */
    private _ensureDir(): void {
        fs.mkdirSync(this._cacheDir, { recursive: true });
    }

    /** Read the index from disk, or start with an empty index. */
    private _loadIndex(): void {
        try {
            const raw = fs.readFileSync(this._indexPath(), 'utf-8');
            this._index = JSON.parse(raw) as CacheIndex;
        } catch {
            this._index = {};
        }
    }

    /** Persist the current index to disk. */
    private _saveIndex(): void {
        try {
            fs.writeFileSync(this._indexPath(), JSON.stringify(this._index, null, 2));
        } catch (err) {
            log(
                `EECache: failed to write index: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Check if introspection data exists for a given image SHA.
     *
     * @param sha - Image content digest.
     * @returns True when both the index entry and detail file exist.
     */
    has(sha: string): boolean {
        if (!(sha in this._index)) return false;
        try {
            fs.accessSync(this._detailPath(sha), fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Read cached EEDetails for a SHA.
     *
     * @param sha - Image content digest.
     * @returns Cached details, or null if not cached.
     */
    get(sha: string): EEDetails | null {
        if (!this.has(sha)) return null;
        try {
            const raw = fs.readFileSync(this._detailPath(sha), 'utf-8');
            return JSON.parse(raw) as EEDetails;
        } catch {
            return null;
        }
    }

    /**
     * Store EEDetails for an image SHA.
     *
     * @param sha - Image content digest.
     * @param fullName - Full image name (repository:tag).
     * @param details - Introspection payload to cache.
     */
    set(sha: string, fullName: string, details: EEDetails): void {
        const parts = fullName.split(':');
        const tag = parts.length > 1 ? (parts.at(-1) ?? 'latest') : 'latest';
        this._index[sha] = {
            fullName,
            tag,
            introspectedAt: new Date().toISOString(),
        };
        try {
            fs.writeFileSync(this._detailPath(sha), JSON.stringify(details, null, 2));
        } catch (err) {
            log(
                `EECache: failed to write detail for ${sha}: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
        this._saveIndex();
    }

    /**
     * Remove a specific SHA from the cache.
     *
     * @param sha - Image content digest to remove.
     */
    remove(sha: string): void {
        this._index = Object.fromEntries(
            Object.entries(this._index).filter(([key]) => key !== sha),
        );
        try {
            fs.unlinkSync(this._detailPath(sha));
        } catch {
            // already gone
        }
        this._saveIndex();
    }

    /**
     * Prune entries whose SHAs are no longer present in the given set
     * of current image IDs (i.e. the image was removed or replaced).
     * Writes the index once at the end instead of per-entry.
     *
     * @param currentShas - Set of image SHAs currently present locally.
     * @returns Number of entries removed.
     */
    prune(currentShas: Set<string>): number {
        const stale = Object.keys(this._index).filter((sha) => !currentShas.has(sha));
        if (stale.length === 0) {
            return 0;
        }

        for (const sha of stale) {
            try {
                fs.unlinkSync(this._detailPath(sha));
            } catch {
                // already gone
            }
        }

        this._index = Object.fromEntries(
            Object.entries(this._index).filter(([key]) => currentShas.has(key)),
        );
        this._saveIndex();

        log(`EECache: pruned ${String(stale.length)} stale entries`);
        return stale.length;
    }

    /** Clear the entire cache. */
    clear(): void {
        for (const sha of Object.keys(this._index)) {
            try {
                fs.unlinkSync(this._detailPath(sha));
            } catch {
                // already gone
            }
        }
        this._index = {};
        this._saveIndex();
        log('EECache: cleared all entries');
    }

    /**
     * Get the index entry for a SHA (metadata only, no details).
     *
     * @param sha - Image content digest.
     * @returns Index metadata, or undefined if not cached.
     */
    getEntry(sha: string): CacheIndexEntry | undefined {
        return this._index[sha];
    }

    /**
     * Get all indexed SHAs.
     *
     * @returns Array of cached image SHAs.
     */
    keys(): string[] {
        return Object.keys(this._index);
    }

    /**
     * Number of cached entries.
     *
     * @returns Count of entries in the index.
     */
    get size(): number {
        return Object.keys(this._index).length;
    }
}
