/**
 * Types for Galaxy collection caching.
 */

/** A collection discovered from Ansible Galaxy. */
export interface GalaxyCollection {
    namespace: string;
    name: string;
    version: string;
    deprecated: boolean;
    downloadCount: number;
}
