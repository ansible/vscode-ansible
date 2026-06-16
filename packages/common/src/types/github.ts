/**
 * Types for GitHub collection caching.
 */

/** Represents a collection found in a GitHub organization. */
export interface GitHubCollection {
    namespace: string;
    name: string;
    version: string;
    description: string;
    repository: string;
    org: string;
    htmlUrl: string;
    installUrl: string;
}
