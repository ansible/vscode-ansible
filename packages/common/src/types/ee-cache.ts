/**
 * Types for EE image cache.
 */

/** Metadata stored in the cache index for each image SHA. */
export interface CacheIndexEntry {
    fullName: string;
    tag: string;
    introspectedAt: string;
}

/** Maps image SHA to its cache index entry. */
export type CacheIndex = Record<string, CacheIndexEntry>;
