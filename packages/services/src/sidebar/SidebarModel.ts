/**
 * Host-agnostic sidebar NavTree model (ADR-025).
 * Thin orchestrator over {@link SECTION_REGISTRY}.
 */
import type {
    EEDetails,
    PluginInfo,
    SidebarSectionId,
    SidebarSnapshot,
    SidebarTreeNode,
    SystemPackageDetail,
} from '@ansible/common';
import { loadingNode } from './helpers';
import { SECTION_REGISTRY } from './registry';
import { buildEeDetailNodes, buildPluginTypeNodes, patchNodeChildren } from './expand';
import type { SidebarModelInput, SidebarSkeletonOptions } from './types';

export type {
    SidebarAiToolInput,
    SidebarLightspeedItem,
    SidebarCollectionSourceInput,
    SidebarCreatorInput,
    SidebarPlaybookWorkspaceInput,
    SidebarModelInput,
    SidebarSkeletonOptions,
} from './types';

/**
 * Builds serializable snapshots for VS Code WebviewView / Electron.
 */
export class SidebarModel {
    /**
     * Build a full sidebar snapshot from plain service inputs.
     * @param input - Environment, tools, collections, sources, EE, creator, playbooks
     * @returns Snapshot for the React shell
     */
    public buildSnapshot(input: SidebarModelInput): SidebarSnapshot {
        const sections = SECTION_REGISTRY.filter((def) => def.include?.(input) ?? true).map((def) =>
            def.build(input),
        );
        return {
            sections,
            suggestedOpenSectionId: this.suggestOpenSection(input),
        };
    }

    /**
     * Header-only snapshot for progressive hydration (paint before async work).
     * @param options - Which optional AI / Lightspeed sections to include
     * @returns Skeleton snapshot (no issue-driven open)
     */
    public buildSkeletonSnapshot(options: SidebarSkeletonOptions = {}): SidebarSnapshot {
        const gate: SidebarModelInput = {
            pythonAvailable: true,
            enableAiFeatures: options.enableAiFeatures ?? false,
            envManagers: [],
            devTools: [],
            hasDevTools: false,
            collections: [],
            playbooks: [],
            lightspeedEnabled: options.lightspeedEnabled ?? false,
        };
        const sections = SECTION_REGISTRY.filter((def) => def.include?.(gate) ?? true).map(
            (def) => ({
                id: def.id,
                title: def.title,
                loading: true as const,
                nodes: [loadingNode(def.id)],
            }),
        );
        return {
            sections,
            suggestedOpenSectionId: null,
        };
    }

    /**
     * Choose which section should auto-open for a known issue.
     * @param input - Same inputs as buildSnapshot
     * @returns Section id to open, or null when healthy
     */
    public suggestOpenSection(input: SidebarModelInput): SidebarSectionId | null {
        for (const def of SECTION_REGISTRY) {
            if (!(def.include?.(input) ?? true)) {
                continue;
            }
            if (def.suggest?.(input)) {
                return def.id;
            }
        }
        return null;
    }

    /**
     * Build EE detail categories (Info / Collections / Python / System).
     * @param parentId - EE node id
     * @param fullName - Image full name
     * @param details - Loaded EE details, or null on failure
     * @param systemPackages - System packages for the image
     * @returns Category nodes with package leaves
     */
    public buildEeDetailNodes(
        parentId: string,
        fullName: string,
        details: EEDetails | null,
        systemPackages: Pick<SystemPackageDetail, 'name' | 'version'>[],
    ): SidebarTreeNode[] {
        return buildEeDetailNodes(parentId, fullName, details, systemPackages);
    }

    /**
     * Build plugin-type folders with plugin leaves for Galaxy / GitHub sources.
     * @param parentId - Parent collection node id
     * @param pluginTypes - Plugins grouped by type, or null on fetch failure
     * @param collection - Serializable collection identity for doc commands
     * @param collection.namespace - Collection namespace
     * @param collection.name - Collection name
     * @param collection.version - Collection version string
     * @param collection.org - Optional GitHub org (SCM sources)
     * @param collection.repository - Optional GitHub repository (SCM sources)
     * @param source - Galaxy vs GitHub
     * @param enableAiFeatures - When true, add Describe with AI
     * @returns Child nodes for the collection row
     */
    public buildPluginTypeNodes(
        parentId: string,
        pluginTypes: Record<string, PluginInfo[]> | null,
        collection: {
            namespace: string;
            name: string;
            version: string;
            org?: string;
            repository?: string;
        },
        source: 'galaxy' | 'github',
        enableAiFeatures: boolean,
    ): SidebarTreeNode[] {
        return buildPluginTypeNodes(parentId, pluginTypes, collection, source, enableAiFeatures);
    }

    /**
     * Replace one node's children and clear lazyChildren in a copied snapshot.
     * @param snapshot - Current snapshot
     * @param nodeId - Node to update
     * @param children - Resolved children
     * @returns New snapshot
     */
    public patchNodeChildren(
        snapshot: SidebarSnapshot,
        nodeId: string,
        children: SidebarTreeNode[],
    ): SidebarSnapshot {
        return patchNodeChildren(snapshot, nodeId, children);
    }
}
