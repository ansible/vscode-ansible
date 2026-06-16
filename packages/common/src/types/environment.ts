/**
 * Types for Python environment caching.
 */

/** Persisted Python environment selection. */
export interface CachedEnvironment {
    pythonPath: string;
    binDir: string;
    displayName?: string;
    timestamp: string;
}
