/**
 * Collection Sources NavTree section.
 */
import type { SidebarNodeAction, SidebarSection, SidebarTreeNode } from '@ansible/common';
import type { SidebarModelInput } from '../types';

/**
 * Build Collection Sources (Galaxy + GitHub orgs) with native header/inline actions.
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildCollectionSources(input: SidebarModelInput): SidebarSection {
    const sources = input.collectionSources ?? [];
    const nodes: SidebarTreeNode[] = sources.map((source) => {
        const sourceInfo = {
            type: source.type,
            id: source.id,
            name: source.name,
            count: source.count,
            isRefreshing: source.isRefreshing ?? false,
        };
        const sourceArg = { source: sourceInfo };
        let description: string;
        if (source.isRefreshing) {
            description = 'Refreshing...';
        } else if (source.type === 'galaxy' && source.galaxyFilter) {
            description = `filter: "${source.galaxyFilter}" (${String(source.galaxyFilterResultCount ?? 0)} results)`;
        } else {
            description = `${source.count.toLocaleString()} collections`;
        }
        const sourceActions: SidebarNodeAction[] =
            source.type === 'galaxy'
                ? [
                      {
                          id: `filter-${source.id}`,
                          label: 'Filter Collections',
                          icon: 'filter',
                          command: 'ansibleCollectionSources.filterGalaxyCollections',
                      },
                      ...(source.galaxyFilter
                          ? [
                                {
                                    id: `clear-filter-${source.id}`,
                                    label: 'Clear Filter',
                                    icon: 'close',
                                    command: 'ansibleCollectionSources.clearGalaxyFilter',
                                },
                            ]
                          : []),
                      {
                          id: `refresh-${source.id}`,
                          label: 'Refresh Source',
                          icon: 'refresh',
                          command: 'ansibleCollectionSources.refreshSource',
                          args: [sourceArg],
                      },
                      ...(input.enableAiFeatures
                          ? [
                                {
                                    id: `ai-src-${source.id}`,
                                    label: 'Generate AI Summary',
                                    icon: 'sparkle',
                                    command: 'ansibleCollectionSources.aiSourceSummary',
                                    args: [sourceArg],
                                },
                            ]
                          : []),
                  ]
                : [
                      {
                          id: `install-src-${source.id}`,
                          label: 'Install from Source',
                          icon: 'cloud-download',
                          command: 'ansibleCollectionSources.installFromSource',
                          args: [sourceArg],
                      },
                      {
                          id: `search-src-${source.id}`,
                          label: 'Search in Source',
                          icon: 'search',
                          command: 'ansibleCollectionSources.searchSource',
                          args: [sourceArg],
                      },
                      {
                          id: `refresh-${source.id}`,
                          label: 'Refresh Source',
                          icon: 'refresh',
                          command: 'ansibleCollectionSources.refreshSource',
                          args: [sourceArg],
                      },
                      ...(input.enableAiFeatures
                          ? [
                                {
                                    id: `ai-src-${source.id}`,
                                    label: 'Generate AI Summary',
                                    icon: 'sparkle',
                                    command: 'ansibleCollectionSources.aiSourceSummary',
                                    args: [sourceArg],
                                },
                            ]
                          : []),
                  ];
        const sourceTip: string[] = [
            source.name,
            '',
            `Type: ${source.type === 'galaxy' ? 'Ansible Galaxy' : 'GitHub Organization'}`,
            '',
            `Collections: ${source.count.toLocaleString()}`,
        ];
        if (source.lastUpdated) {
            sourceTip.push('', `Last Updated: ${source.lastUpdated}`);
        }
        return {
            id: `source-${source.id}`,
            label: source.name,
            description,
            tooltip: sourceTip.join('\n'),
            icon: source.type === 'galaxy' ? 'globe' : 'github',
            actions: sourceActions,
            children: source.topCollections?.map((col) => {
                const version = col.version ?? '';
                const collection = {
                    namespace: col.namespace,
                    name: col.collectionName,
                    version,
                    org: col.org ?? source.id,
                    repository: col.repository ?? '',
                    description: col.description ?? '',
                    htmlUrl: col.htmlUrl ?? '',
                    installUrl: col.installUrl ?? '',
                };
                const lazyExpand =
                    source.type === 'galaxy'
                        ? {
                              kind: 'galaxyCollection' as const,
                              namespace: col.namespace,
                              name: col.collectionName,
                              version,
                          }
                        : {
                              kind: 'githubCollection' as const,
                              org: col.org ?? source.id,
                              namespace: col.namespace,
                              name: col.collectionName,
                              version,
                              repository: col.repository ?? '',
                          };
                const collectionActions: SidebarNodeAction[] =
                    source.type === 'galaxy'
                        ? [
                              {
                                  id: `install-col-${col.namespace}.${col.collectionName}`,
                                  label: 'Install Collection',
                                  icon: 'cloud-download',
                                  command: 'ansibleCollectionSources.installGalaxyCollection',
                                  args: [{ collection }],
                              },
                          ]
                        : [
                              {
                                  id: `refresh-docs-${col.namespace}.${col.collectionName}`,
                                  label: 'Refresh Plugin Docs',
                                  icon: 'refresh',
                                  command: 'ansibleCollectionSources.refreshGitHubCollection',
                                  args: [{ collection }],
                              },
                          ];
                const colTip: string[] = [col.name];
                if (version) {
                    colTip.push('', `Version: ${version}`);
                }
                if (source.type === 'galaxy') {
                    if (col.downloadCount !== undefined) {
                        colTip.push('', `Downloads: ${col.downloadCount.toLocaleString()}`);
                    }
                    if (col.deprecated) {
                        colTip.push('', 'deprecated');
                    }
                } else {
                    if (col.org) {
                        colTip.push('', `Org: ${col.org}`);
                    }
                    if (col.description) {
                        colTip.push('', col.description);
                    }
                }
                return {
                    id: `source-col-${source.id}-${col.namespace}.${col.collectionName}`,
                    label: col.name,
                    description: version ? `v${version}` : undefined,
                    tooltip: colTip.join('\n'),
                    icon: 'library',
                    lazyChildren: Boolean(version),
                    expand: version ? lazyExpand : undefined,
                    actions: collectionActions,
                };
            }),
        };
    });
    return {
        id: 'collectionSources',
        title: 'Collection Sources',
        headerActions: [
            {
                id: 'sources-search',
                label: 'Search Collections',
                icon: 'search',
                command: 'ansibleCollectionSources.search',
            },
            {
                id: 'sources-install',
                label: 'Install Collection',
                icon: 'cloud-download',
                command: 'ansibleCollectionSources.install',
            },
            {
                id: 'sources-add',
                label: 'Add GitHub Organization',
                icon: 'add',
                command: 'ansibleCollectionSources.addSource',
            },
            {
                id: 'sources-refresh',
                label: 'Refresh All Sources',
                icon: 'refresh',
                command: 'ansibleCollectionSources.refresh',
            },
            ...(input.enableAiFeatures
                ? [
                      {
                          id: 'sources-ai',
                          label: 'AI Summary',
                          icon: 'sparkle',
                          command: 'ansibleCollectionSources.aiSummary',
                      },
                  ]
                : []),
        ],
        nodes,
    };
}
