/**
 * Shared parser for `ansible-doc --metadata-dump` JSON output.
 *
 * Used by both CollectionsService (for installed collections) and
 * SCMDocsCache (for shallow-cloned GitHub collections).
 */

import type { CollectionInfo, PluginInfo, PluginData, PluginDoc, PluginReturn } from '../types';

/** A single plugin entry in the metadata dump. */
interface MetadataEntry {
    doc?: PluginDoc;
    examples?: string;
    return?: PluginReturn;
    metadata?: unknown;
}

/** Plugins grouped by type within the dump. */
type MetadataPluginTypes = Record<string, Record<string, MetadataEntry>>;

/** Top-level shape of `ansible-doc --metadata-dump` output. */
export interface MetadataDump {
    all?: MetadataPluginTypes;
}

/** Collection info plus plugins organized by type. */
export interface ParsedCollection {
    info: CollectionInfo;
    pluginTypes: Map<string, PluginInfo[]>;
}

/** Result of parsing a metadata dump. */
export interface MetadataDumpResult {
    collections: Map<string, ParsedCollection>;
    pluginDocs: Map<string, PluginData>;
}

/**
 * Extracts the JSON object from raw ansible-doc output, stripping any
 * leading warnings or non-JSON text.
 *
 * @param raw - Raw stdout from `ansible-doc --metadata-dump`.
 * @returns Parsed MetadataDump, or null if no JSON was found.
 */
export function extractMetadataJson(raw: string): MetadataDump | null {
    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1) {
        return null;
    }
    try {
        return JSON.parse(raw.substring(jsonStart)) as MetadataDump;
    } catch {
        return null;
    }
}

/**
 * Parses a metadata dump into collections and plugin documentation maps.
 *
 * @param metadata - Parsed metadata dump object.
 * @param collectionInfoMap - Optional pre-populated collection info (e.g. from `ade inspect`).
 * @returns Parsed collections and plugin documentation.
 */
export function parseMetadataDump(
    metadata: MetadataDump,
    collectionInfoMap?: Map<string, CollectionInfo>,
): MetadataDumpResult {
    const collections = new Map<string, ParsedCollection>();
    const pluginDocs = new Map<string, PluginData>();

    if (!metadata.all) {
        return { collections, pluginDocs };
    }

    const seenPlugins = new Set<string>();

    for (const [pluginType, plugins] of Object.entries(metadata.all)) {
        for (const [fullName, pluginData] of Object.entries(plugins)) {
            const doc = pluginData.doc;
            if (!doc) {
                continue;
            }

            const collectionName = doc.collection ?? 'unknown';
            const pluginName =
                doc.plugin_name?.split('.').pop() ?? fullName.split('.').pop() ?? fullName;
            const shortDescription = doc.short_description ?? '';

            const uniqueKey = `${collectionName}:${pluginType}:${fullName}`;
            if (seenPlugins.has(uniqueKey)) {
                continue;
            }
            seenPlugins.add(uniqueKey);

            const docKey = `${fullName}:${pluginType}`;
            pluginDocs.set(docKey, {
                doc: pluginData.doc,
                examples: pluginData.examples,
                return: pluginData.return,
                metadata: pluginData.metadata,
            });

            let collection = collections.get(collectionName);
            if (!collection) {
                const info = collectionInfoMap?.get(collectionName) ?? {
                    name: collectionName,
                    version: '',
                    authors: [],
                    description: '',
                };
                collection = { info, pluginTypes: new Map() };
                collections.set(collectionName, collection);
            }

            let typePlugins = collection.pluginTypes.get(pluginType);
            if (!typePlugins) {
                typePlugins = [];
                collection.pluginTypes.set(pluginType, typePlugins);
            }

            typePlugins.push({
                name: pluginName,
                fullName,
                shortDescription,
            });
        }
    }

    for (const collection of collections.values()) {
        for (const typePlugins of collection.pluginTypes.values()) {
            typePlugins.sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    return { collections, pluginDocs };
}
