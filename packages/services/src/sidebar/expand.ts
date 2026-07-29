/**
 * Lazy-expand node builders for the sidebar NavTree (pure / browser-safe inputs).
 */
import type {
    EEDetails,
    PluginInfo,
    SidebarSnapshot,
    SidebarTreeNode,
    SystemPackageDetail,
} from '@ansible/common';

/**
 * Build EE detail categories (Info / Collections / Python / System).
 * Host loads details via ExecutionEnvService; this stays browser-safe.
 * @param parentId - EE node id
 * @param fullName - Image full name (for package-detail command args)
 * @param details - Loaded EE details, or null on failure
 * @param systemPackages - System packages for the image
 * @returns Category nodes with package leaves
 */
export function buildEeDetailNodes(
    parentId: string,
    fullName: string,
    details: EEDetails | null,
    systemPackages: Pick<SystemPackageDetail, 'name' | 'version'>[],
): SidebarTreeNode[] {
    if (!details) {
        return [
            {
                id: `${parentId}-error`,
                label: 'Failed to load details',
                icon: 'warning',
            },
        ];
    }
    const categories: SidebarTreeNode[] = [];
    const infoChildren: SidebarTreeNode[] = [];
    if (details.ansible_version?.details) {
        infoChildren.push({
            id: `${parentId}-info-ansible`,
            label: 'Ansible',
            description: details.ansible_version.details,
            icon: 'info',
        });
    }
    const osDetails = details.os_release?.details;
    if (osDetails?.[0]) {
        const os = osDetails[0];
        infoChildren.push({
            id: `${parentId}-info-os`,
            label: 'OS',
            description: os['pretty-name'] ?? os.name ?? 'Unknown',
            icon: 'info',
        });
    }
    if (details.image_name) {
        infoChildren.push({
            id: `${parentId}-info-image`,
            label: 'Image',
            description: details.image_name,
            icon: 'info',
        });
    }
    if (infoChildren.length > 0) {
        categories.push({
            id: `${parentId}-info`,
            label: 'Info',
            icon: 'info',
            children: infoChildren,
        });
    }
    if (details.ansible_collections?.details) {
        const cols = Object.entries(details.ansible_collections.details).sort(([a], [b]) =>
            a.localeCompare(b),
        );
        if (cols.length > 0) {
            categories.push({
                id: `${parentId}-collections`,
                label: 'Ansible Collections',
                description: `(${String(cols.length)})`,
                icon: 'library',
                children: cols.map(([name, version]) => ({
                    id: `${parentId}-col-${name}`,
                    label: name,
                    description: version,
                    icon: 'library',
                })),
            });
        }
    }
    if (details.python_packages?.details) {
        const pkgs = [...details.python_packages.details].sort((a, b) =>
            a.name.localeCompare(b.name),
        );
        if (pkgs.length > 0) {
            categories.push({
                id: `${parentId}-python`,
                label: 'Python Packages',
                description: `(${String(pkgs.length)})`,
                icon: 'package',
                children: pkgs.map((pkg) => ({
                    id: `${parentId}-py-${pkg.name}`,
                    label: pkg.name,
                    description: pkg.version,
                    tooltip: pkg.summary ?? undefined,
                    icon: 'package',
                    actions: [
                        {
                            id: `py-detail-${pkg.name}`,
                            label: 'Show Package Detail',
                            icon: 'info',
                            command: 'ansibleExecutionEnvironments.showPackageDetail',
                            args: [fullName, pkg.name, 'python'],
                        },
                    ],
                })),
            });
        }
    }
    if (systemPackages.length > 0) {
        categories.push({
            id: `${parentId}-system`,
            label: 'System Packages',
            description: `(${String(systemPackages.length)})`,
            icon: 'server',
            children: systemPackages.map((pkg) => ({
                id: `${parentId}-sys-${pkg.name}`,
                label: pkg.name,
                description: pkg.version,
                icon: 'server-process',
                actions: [
                    {
                        id: `sys-detail-${pkg.name}`,
                        label: 'Show Package Detail',
                        icon: 'info',
                        command: 'ansibleExecutionEnvironments.showPackageDetail',
                        args: [fullName, pkg.name, 'system'],
                    },
                ],
            })),
        });
    }
    return categories.length > 0
        ? categories
        : [
              {
                  id: `${parentId}-empty`,
                  label: 'No details available',
                  icon: 'info',
              },
          ];
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
 * @param source - Galaxy vs GitHub (selects open-doc / AI commands)
 * @param enableAiFeatures - When true, add Describe with AI
 * @returns Child nodes for the collection row
 */
export function buildPluginTypeNodes(
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
    if (!pluginTypes) {
        const errorTooltip =
            source === 'galaxy'
                ? `Could not fetch docs-blob for ${collection.namespace}.${collection.name} v${collection.version}. Click the collection to retry.`
                : `Could not index ${collection.namespace}.${collection.name}. Requires git and ansible-doc on PATH. Click to retry.`;
        return [
            {
                id: `${parentId}-error`,
                label: 'Failed to load plugin documentation',
                tooltip: errorTooltip,
                icon: 'warning',
            },
        ];
    }
    const docCommand =
        source === 'galaxy'
            ? 'ansibleCollectionSources.showGalaxyPluginDoc'
            : 'ansibleCollectionSources.showGitHubPluginDoc';
    const aiCommand =
        source === 'galaxy'
            ? 'ansibleCollectionSources.galaxyPluginAiSummary'
            : 'ansibleCollectionSources.githubPluginAiSummary';
    return Object.entries(pluginTypes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pluginType, plugins]) => ({
            id: `${parentId}-type-${pluginType}`,
            label: pluginType,
            description: `(${String(plugins.length)})`,
            icon: 'symbol-folder',
            children: plugins.map((plugin) => {
                const nodeArg = { collection, plugin, pluginType };
                const tip: string[] = [`${plugin.fullName} (${pluginType})`];
                if (plugin.shortDescription) {
                    tip.push('', plugin.shortDescription);
                }
                tip.push(
                    '',
                    `Collection: ${collection.namespace}.${collection.name} v${collection.version}`,
                );
                if (source === 'github' && collection.org && collection.repository) {
                    tip.push(`Source: ${collection.org}/${collection.repository}`);
                }
                return {
                    id: `${parentId}-plugin-${pluginType}-${plugin.fullName}`,
                    label: plugin.name,
                    description: plugin.shortDescription,
                    tooltip: tip.join('\n'),
                    icon: 'symbol-method',
                    actions: [
                        {
                            id: `doc-${plugin.fullName}`,
                            label: 'Show Plugin Documentation',
                            icon: 'book',
                            command: docCommand,
                            args: [nodeArg],
                        },
                        ...(enableAiFeatures
                            ? [
                                  {
                                      id: `ai-${plugin.fullName}`,
                                      label: 'Describe with AI',
                                      icon: 'sparkle',
                                      command: aiCommand,
                                      args: [nodeArg],
                                  },
                              ]
                            : []),
                    ],
                };
            }),
        }));
}

/**
 * Replace one node's children and clear lazyChildren in a copied snapshot.
 * @param snapshot - Current snapshot
 * @param nodeId - Node to update
 * @param children - Resolved children
 * @returns New snapshot
 */
export function patchNodeChildren(
    snapshot: SidebarSnapshot,
    nodeId: string,
    children: SidebarTreeNode[],
): SidebarSnapshot {
    const patch = (nodes: SidebarTreeNode[]): SidebarTreeNode[] =>
        nodes.map((n) => {
            if (n.id === nodeId) {
                return { ...n, lazyChildren: false, children };
            }
            if (n.children?.length) {
                return { ...n, children: patch(n.children) };
            }
            return n;
        });
    return {
        ...snapshot,
        sections: snapshot.sections.map((s) => ({
            ...s,
            nodes: patch(s.nodes),
        })),
    };
}
