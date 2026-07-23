/**
 * Pure assembly of {@link SidebarModelInput} from already-fetched plain data.
 * No vscode / Node service singletons — host gathers, this shapes.
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
import type {
    SidebarAiToolInput,
    SidebarCollectionSourceInput,
    SidebarModelInput,
    SidebarPlaybookWorkspaceInput,
} from './types';

/** Galaxy collection row for NavTree source shaping. */
export interface AssembleGalaxyCollection {
    namespace: string;
    name: string;
    version?: string;
    downloadCount?: number;
    deprecated?: boolean;
}

/** GitHub collection row for NavTree source shaping. */
export interface AssembleGitHubCollection {
    namespace: string;
    name: string;
    version?: string;
    org: string;
    repository: string;
    description?: string;
    htmlUrl?: string;
    installUrl?: string;
}

/** One GitHub org block for collection sources. */
export interface AssembleGitHubOrg {
    org: string;
    count: number;
    isRefreshing?: boolean;
    /** Pre-formatted locale string for tooltips. */
    lastUpdated?: string;
    collections: AssembleGitHubCollection[];
}

/** MCP tool row before label truncation / category labels. */
export interface AssembleMcpTool {
    category: string;
    tool: { name: string; description: string };
    examplePrompt: string;
    /** Full tool payload retained for useInChat. */
    toolInfo: unknown;
}

/** Inputs gathered by the host before pure assembly. */
export interface AssembleSidebarInputArgs {
    pythonAvailable: boolean;
    pythonEnvCapability?: SidebarModelInput['pythonEnvCapability'];
    enableAiFeatures: boolean;
    envManagers: SidebarEnvManagerInput[];
    devTools: DevToolPackage[];
    hasDevTools: boolean;
    collections: CollectionData[];
    collectionsIndexing?: boolean;
    galaxy: {
        totalCount: number;
        isLoading: boolean;
        filter?: string;
        listed: AssembleGalaxyCollection[];
    };
    githubOrgs: AssembleGitHubOrg[];
    executionEnvironments: ExecutionEnvironment[];
    executionEnvironmentsLoading?: boolean;
    executionEnvironmentsError?: string;
    creator: {
        status: CreatorStatus;
        installedVersion?: string;
        schema: SchemaNode | null;
    };
    playbookWorkspaces: SidebarPlaybookWorkspaceInput[];
    mcpConfigured?: boolean;
    mcpIdeLabel?: string;
    mcpCategoryLabels?: Record<string, string>;
    mcpTools?: AssembleMcpTool[];
    skillSources?: SkillSource[];
    skills?: SkillEntry[];
    lightspeedEnabled?: boolean;
    lightspeedAuthenticated?: boolean;
}

/**
 * Shape Galaxy + GitHub cache rows into hub collection-source inputs.
 * @param galaxy - Galaxy list / filter slice
 * @param githubOrgs - Per-org collection lists
 * @returns Serializable collectionSources for SidebarModel
 */
export function assembleCollectionSources(
    galaxy: AssembleSidebarInputArgs['galaxy'],
    githubOrgs: AssembleGitHubOrg[],
): SidebarCollectionSourceInput[] {
    return [
        {
            id: 'galaxy',
            name: 'Ansible Galaxy',
            type: 'galaxy',
            count: galaxy.totalCount,
            isRefreshing: galaxy.isLoading,
            galaxyFilter: galaxy.filter,
            galaxyFilterResultCount: galaxy.filter ? galaxy.listed.length : undefined,
            topCollections: galaxy.listed.map((c) => ({
                name: `${c.namespace}.${c.name}`,
                version: c.version,
                namespace: c.namespace,
                collectionName: c.name,
                downloadCount: c.downloadCount,
                deprecated: c.deprecated,
            })),
        },
        ...githubOrgs.map((org) => ({
            id: org.org,
            name: org.org,
            type: 'github' as const,
            count: org.count,
            isRefreshing: org.isRefreshing,
            lastUpdated: org.lastUpdated,
            topCollections: org.collections
                .slice()
                .sort((a, b) =>
                    `${a.namespace}.${a.name}`.localeCompare(`${b.namespace}.${b.name}`),
                )
                .map((c) => ({
                    name: `${c.namespace}.${c.name}`,
                    version: c.version,
                    namespace: c.namespace,
                    collectionName: c.name,
                    org: c.org,
                    repository: c.repository,
                    description: c.description,
                    htmlUrl: c.htmlUrl,
                    installUrl: c.installUrl,
                })),
        })),
    ];
}

/**
 * Map MCP tool rows into NavTree AI Tools inputs.
 * @param tools - Tools from the MCP controller
 * @param categoryLabels - Display labels by category id
 * @returns Ai tool inputs, or undefined when empty
 */
export function assembleAiTools(
    tools: AssembleMcpTool[] | undefined,
    categoryLabels: Record<string, string>,
): SidebarAiToolInput[] | undefined {
    if (!tools?.length) {
        return undefined;
    }
    return tools.map((t) => {
        const firstLine = t.tool.description.split('\n')[0]?.trim() || t.tool.name;
        const label = firstLine.length > 60 ? `${firstLine.substring(0, 57)}...` : firstLine;
        return {
            category: t.category,
            categoryLabel: categoryLabels[t.category] ?? t.category,
            name: t.tool.name,
            label,
            examplePrompt: t.examplePrompt,
            toolInfo: t.toolInfo,
        };
    });
}

/**
 * Build a complete {@link SidebarModelInput} from host-gathered plain data.
 * @param args - Fetched service/cache values
 * @returns Input for SidebarModel.buildSnapshot
 */
export function assembleSidebarInput(args: AssembleSidebarInputArgs): SidebarModelInput {
    const playbooks: DiscoveredPlaybook[] = args.playbookWorkspaces.flatMap((ws) => ws.playbooks);
    return {
        pythonAvailable: args.pythonAvailable,
        pythonEnvCapability: args.pythonEnvCapability,
        enableAiFeatures: args.enableAiFeatures,
        envManagers: args.envManagers,
        devTools: args.devTools,
        hasDevTools: args.hasDevTools,
        collections: args.collectionsIndexing ? [] : args.collections,
        collectionsIndexing: args.collectionsIndexing,
        collectionSources: assembleCollectionSources(args.galaxy, args.githubOrgs),
        executionEnvironments: args.executionEnvironmentsError ? [] : args.executionEnvironments,
        executionEnvironmentsLoading: args.executionEnvironmentsLoading,
        executionEnvironmentsError: args.executionEnvironmentsError,
        creator: args.creator,
        playbooks,
        playbookWorkspaces: args.playbookWorkspaces,
        aiTools: args.enableAiFeatures
            ? assembleAiTools(args.mcpTools, args.mcpCategoryLabels ?? {})
            : undefined,
        mcpConfigured: args.mcpConfigured,
        mcpIdeLabel: args.mcpIdeLabel,
        skillSources: args.skillSources,
        skills: args.skills,
        lightspeedEnabled: args.lightspeedEnabled,
        lightspeedAuthenticated: args.lightspeedAuthenticated,
    };
}
