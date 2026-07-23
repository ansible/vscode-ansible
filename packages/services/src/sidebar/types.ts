/**
 * Sidebar NavTree model input types (ADR-025).
 */
import type {
    CollectionData,
    CreatorStatus,
    ExecutionEnvironment,
    SchemaNode,
    SidebarEnvManagerInput,
    SkillEntry,
    SkillSource,
} from '@ansible/common';
import type { DevToolPackage } from '../DevToolsService';
import type { DiscoveredPlaybook } from '../PlaybookDiscovery';

export interface SidebarAiToolInput {
    category: string;
    categoryLabel: string;
    name: string;
    label: string;
    examplePrompt: string;
    /** Full tool payload for ansibleMcpTools.useInChat */
    toolInfo: unknown;
}

/** Lightspeed entry when the Lightspeed package is active. */
export interface SidebarLightspeedItem {
    label: string;
    icon: string;
    command: string;
}

/** Root collection-source row (Galaxy / GitHub org). */
export interface SidebarCollectionSourceInput {
    id: string;
    name: string;
    type: 'galaxy' | 'github';
    count: number;
    isRefreshing?: boolean;
    /** Active Galaxy name filter (native collectionSourceGalaxyFiltered). */
    galaxyFilter?: string;
    galaxyFilterResultCount?: number;
    /** Collections shown under this source (Galaxy: top-10 or filter hits; GitHub: all). */
    /** Locale string for native source tooltip "Last Updated". */
    lastUpdated?: string;
    topCollections?: {
        /** Display label (usually namespace.name). */
        name: string;
        version?: string;
        namespace: string;
        collectionName: string;
        /** GitHub org when type is github. */
        org?: string;
        repository?: string;
        description?: string;
        htmlUrl?: string;
        installUrl?: string;
        /** Galaxy download count for tooltip. */
        downloadCount?: number;
        deprecated?: boolean;
    }[];
}

/** Creator schema + readiness for the Creator section. */
export interface SidebarCreatorInput {
    status: CreatorStatus;
    installedVersion?: string;
    schema: SchemaNode | null;
}

/** Playbooks discovered under one workspace folder (multi-root aware). */
export interface SidebarPlaybookWorkspaceInput {
    name: string;
    path: string;
    playbooks: DiscoveredPlaybook[];
}

export interface SidebarModelInput {
    pythonAvailable: boolean;
    /**
     * Capability tier from PythonEnvironmentService (ADR-019).
     * Drives python-only welcome when ms-python.vscode-python-envs is missing.
     */
    pythonEnvCapability?: 'full' | 'envs-no-pet' | 'python-only' | 'unavailable';
    enableAiFeatures: boolean;
    envManagers: SidebarEnvManagerInput[];
    devTools: DevToolPackage[];
    hasDevTools: boolean;
    collections: CollectionData[];
    /** True while CollectionsService is indexing (native "Indexing collections..."). */
    collectionsIndexing?: boolean;
    collectionSources?: SidebarCollectionSourceInput[];
    executionEnvironments?: ExecutionEnvironment[];
    /** True while ExecutionEnvService is loading the image list. */
    executionEnvironmentsLoading?: boolean;
    /** Error message from EE load (e.g. ansible-navigator not in PATH). */
    executionEnvironmentsError?: string;
    creator?: SidebarCreatorInput;
    /** @deprecated Prefer playbookWorkspaces for multi-root parity. */
    playbooks: DiscoveredPlaybook[];
    playbookWorkspaces?: SidebarPlaybookWorkspaceInput[];
    aiTools?: SidebarAiToolInput[];
    /** When false, show MCP-not-configured warning (native McpWarningNode). */
    mcpConfigured?: boolean;
    /** IDE label for MCP warning copy (e.g. "Cursor"). */
    mcpIdeLabel?: string;
    skillSources?: SkillSource[];
    skills?: SkillEntry[];
    lightspeedEnabled?: boolean;
    lightspeedAuthenticated?: boolean;
    lightspeedItems?: SidebarLightspeedItem[];
}

/** Options for an immediate header-only skeleton snapshot. */
export interface SidebarSkeletonOptions {
    enableAiFeatures?: boolean;
    lightspeedEnabled?: boolean;
}
