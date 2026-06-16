/**
 * Types for ansible-dev-tools package discovery.
 */

/** A discovered ansible-dev-tools package. */
export interface DevToolPackage {
    name: string;
    version: string;
    location?: string;
}
