/**
 * Types for Ansible collection metadata and plugin documentation.
 */

/** Information about an Ansible collection. */
export interface CollectionInfo {
    name: string;
    version: string;
    authors: string[];
    description: string;
    path?: string;
}

/** Information about a plugin within a collection. */
export interface PluginInfo {
    name: string;
    fullName: string;
    shortDescription: string;
}

/** A collection with its plugins organized by type. */
export interface CollectionData {
    info: CollectionInfo;
    pluginTypes: Map<string, PluginInfo[]>;
}

/** Plugin documentation option. */
export interface PluginOption {
    description?: string | string[];
    type?: string;
    default?: unknown;
    choices?: string[];
    required?: boolean;
    elements?: string;
    aliases?: string[];
    suboptions?: Record<string, PluginOption>;
    version_added?: string;
}

/** Plugin documentation structure. */
export interface PluginDoc {
    author?: string | string[];
    collection?: string;
    description?: string | string[];
    short_description?: string;
    module?: string;
    plugin_name?: string;
    version_added?: string;
    notes?: string | string[];
    options?: Record<string, PluginOption>;
    seealso?: { module?: string; description?: string; link?: string; name?: string }[];
    requirements?: string | string[];
    attributes?: Record<string, unknown>;
}

/** Plugin return value documentation. */
export type PluginReturn = Record<
    string,
    {
        description?: string | string[];
        returned?: string;
        type?: string;
        sample?: unknown;
        contains?: Record<string, unknown>;
    }
>;

/** Complete plugin data including documentation, examples, and return values. */
export interface PluginData {
    doc?: PluginDoc;
    examples?: string;
    return?: PluginReturn;
    metadata?: unknown;
}
