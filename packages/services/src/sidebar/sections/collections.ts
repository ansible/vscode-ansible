/**
 * Installed Collections NavTree section.
 */
import type { SidebarNodeAction, SidebarSection, SidebarTreeNode } from '@ansible/common';
import type { SidebarModelInput } from '../types';

/**
 * Build Installed Collections: collection → plugin-type folders → plugins.
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildCollections(input: SidebarModelInput): SidebarSection {
    const headerActions: SidebarNodeAction[] = [
        {
            id: 'col-search',
            label: 'Search Plugins',
            icon: 'search',
            command: 'ansibleDevToolsCollections.search',
        },
        {
            id: 'col-refresh',
            label: 'Refresh',
            icon: 'refresh',
            command: 'ansibleDevToolsCollections.refresh',
        },
        ...(input.enableAiFeatures
            ? [
                  {
                      id: 'col-ai',
                      label: 'AI Summary',
                      icon: 'sparkle',
                      command: 'ansibleDevToolsCollections.aiSummary',
                  },
              ]
            : []),
    ];
    if (input.collectionsIndexing) {
        return {
            id: 'collections',
            title: 'Installed Collections',
            headerActions,
            nodes: [
                {
                    id: 'collections-indexing',
                    label: 'Indexing collections...',
                    icon: 'loading',
                    tooltip: 'Scanning installed collections and plugins. This may take a moment.',
                },
            ],
        };
    }
    const sorted = [...input.collections].sort((a, b) => a.info.name.localeCompare(b.info.name));
    const nodes: SidebarTreeNode[] = sorted.map((col) => {
        const name = col.info.name;
        const typeEntries = [...col.pluginTypes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const typeNodes: SidebarTreeNode[] = typeEntries.map(([pluginType, plugins]) => ({
            id: `type-${name}-${pluginType}`,
            label: pluginType,
            description: `(${String(plugins.length)})`,
            icon: 'symbol-folder',
            children: plugins.map((plugin) => {
                const fqcn = plugin.fullName || `${name}.${plugin.name}`;
                const pluginArg = { fullName: fqcn, pluginType };
                const tipParts = [fqcn];
                if (plugin.shortDescription) {
                    tipParts.push('', plugin.shortDescription);
                }
                tipParts.push('', 'Click to view documentation');
                return {
                    id: `plugin-${fqcn}`,
                    label: plugin.name,
                    description: plugin.shortDescription || undefined,
                    tooltip: tipParts.join('\n'),
                    icon: 'symbol-method',
                    actions: [
                        {
                            id: `docs-${fqcn}`,
                            label: 'View Documentation',
                            icon: 'book',
                            command: 'ansibleDevToolsCollections.showPluginDoc',
                            args: [pluginArg],
                        },
                        ...(input.enableAiFeatures
                            ? [
                                  {
                                      id: `ai-${fqcn}`,
                                      label: 'Generate AI Summary',
                                      icon: 'sparkle',
                                      command: 'ansibleDevToolsCollections.aiPluginSummary',
                                      args: [pluginArg],
                                  },
                              ]
                            : []),
                    ],
                };
            }),
        }));
        const colTip: string[] = [name];
        if (col.info.version) {
            colTip.push('', `Version: ${col.info.version}`);
        }
        if (col.info.authors.length > 0) {
            colTip.push('', `Authors: ${col.info.authors.join(', ')}`);
        }
        if (col.info.description) {
            colTip.push('', col.info.description);
        }
        if (col.info.path) {
            colTip.push('', '---', '', `Path: ${col.info.path}`);
        }
        return {
            id: `col-${name}`,
            label: name,
            description: col.info.version ? `v${col.info.version}` : undefined,
            tooltip: colTip.join('\n'),
            icon: 'library',
            actions: input.enableAiFeatures
                ? [
                      {
                          id: `ai-col-${name}`,
                          label: 'Generate AI Summary',
                          icon: 'sparkle',
                          command: 'ansibleDevToolsCollections.aiCollectionSummary',
                          args: [{ name }],
                      },
                  ]
                : undefined,
            children: typeNodes.length > 0 ? typeNodes : undefined,
        };
    });
    if (nodes.length === 0) {
        return {
            id: 'collections',
            title: 'Installed Collections',
            headerActions,
            welcome:
                'No installed collections found.\nInstall ansible-dev-tools or refresh after selecting a Python environment.',
            welcomeActions: [
                {
                    id: 'col-refresh-welcome',
                    label: 'Refresh',
                    command: 'ansibleDevToolsCollections.refresh',
                },
                {
                    id: 'col-install-adt',
                    label: 'Install ansible-dev-tools',
                    command: 'ansibleDevToolsPackages.install',
                },
            ],
            nodes: [],
        };
    }
    return {
        id: 'collections',
        title: 'Installed Collections',
        headerActions,
        nodes,
    };
}
