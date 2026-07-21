/**
 * Creator NavTree section.
 */
import {
    formatLabel,
    type CreatorStatus,
    type SchemaNode,
    type SidebarNodeAction,
    type SidebarSection,
    type SidebarTreeNode,
} from '@ansible/common';
import type { SidebarModelInput } from '../types';

/**
 * Build Creator (Init / Add schema tree).
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildCreator(input: SidebarModelInput): SidebarSection {
    const creator = input.creator ?? { status: 'unknown' as CreatorStatus, schema: null };
    const headerActions: SidebarNodeAction[] = [
        ...(input.enableAiFeatures
            ? [
                  {
                      id: 'creator-ai',
                      label: 'AI Summary',
                      icon: 'sparkle',
                      command: 'ansibleCreator.aiSummary',
                  },
              ]
            : []),
        {
            id: 'creator-refresh',
            label: 'Refresh',
            icon: 'refresh',
            command: 'ansibleCreator.refresh',
        },
    ];
    if (!creator.schema) {
        // Native CreatorController MessageNodes (clickable rows, not viewsWelcome)
        if (creator.status === 'outdated') {
            return {
                id: 'creator',
                title: 'Creator',
                headerActions,
                severity: 'warning',
                nodes: [
                    {
                        id: 'creator-outdated',
                        label: 'ansible-creator outdated',
                        description: creator.installedVersion
                            ? `v${creator.installedVersion} — upgrade required`
                            : 'Upgrade required',
                        tooltip:
                            'The installed ansible-creator does not support the "schema" subcommand.\nUpgrade ansible-dev-tools to get the latest version.',
                        icon: 'warning',
                        warning: true,
                        actions: [
                            {
                                id: 'creator-upgrade',
                                label: 'Upgrade ansible-dev-tools',
                                icon: 'arrow-up',
                                command: 'ansibleDevToolsPackages.upgrade',
                            },
                        ],
                    },
                ],
            };
        }
        if (creator.status === 'not-installed') {
            return {
                id: 'creator',
                title: 'Creator',
                headerActions,
                severity: 'warning',
                nodes: [
                    {
                        id: 'creator-missing',
                        label: 'ansible-creator not found',
                        description: 'Click to install',
                        tooltip: 'Install ansible-dev-tools to enable Creator features',
                        icon: 'warning',
                        warning: true,
                        actions: [
                            {
                                id: 'creator-install',
                                label: 'Install ansible-dev-tools',
                                icon: 'cloud-download',
                                command: 'ansibleDevToolsPackages.install',
                            },
                        ],
                    },
                ],
            };
        }
        return {
            id: 'creator',
            title: 'Creator',
            headerActions,
            nodes: [
                {
                    id: 'creator-loading',
                    label: 'Loading...',
                    icon: 'loading',
                },
            ],
        };
    }
    const nodes: SidebarTreeNode[] = [];
    if (creator.schema.subcommands?.init) {
        nodes.push(
            buildCreatorCategory(
                'Init',
                creator.schema.subcommands.init,
                ['init'],
                input.enableAiFeatures,
            ),
        );
    }
    if (creator.schema.subcommands?.add) {
        nodes.push(
            buildCreatorCategory(
                'Add',
                creator.schema.subcommands.add,
                ['add'],
                input.enableAiFeatures,
            ),
        );
    }
    return {
        id: 'creator',
        title: 'Creator',
        headerActions,
        nodes,
    };
}

/**
 * Build a creator category / command subtree from schema.
 * @param label - Display label
 * @param schema - Schema node
 * @param path - Command path for openForm
 * @param enableAiFeatures - When true, add Generate with AI on leaves
 * @returns Tree node
 */
export function buildCreatorCategory(
    label: string,
    schema: SchemaNode,
    path: string[],
    enableAiFeatures: boolean,
): SidebarTreeNode {
    const children: SidebarTreeNode[] = [];
    if (schema.subcommands) {
        for (const [name, subSchema] of Object.entries(schema.subcommands)) {
            const subPath = [...path, name];
            if (subSchema.subcommands && Object.keys(subSchema.subcommands).length > 0) {
                children.push(
                    buildCreatorCategory(formatLabel(name), subSchema, subPath, enableAiFeatures),
                );
            } else {
                const desc = subSchema.description ?? '';
                const cmdLabel = formatLabel(name);
                children.push({
                    id: `creator-cmd-${subPath.join('-')}`,
                    // Match CreatorController CommandNode: title = key, summary = description
                    label: cmdLabel,
                    description:
                        desc.length > 50 ? `${desc.substring(0, 47)}...` : desc || undefined,
                    tooltip: desc || cmdLabel,
                    icon: 'new-file',
                    actions: [
                        {
                            id: `creator-open-${subPath.join('-')}`,
                            label: 'Open Creator Form',
                            icon: 'window',
                            command: 'ansibleCreator.openForm',
                            // Native: arguments: [commandPath, schema]
                            args: [subPath, subSchema],
                        },
                        ...(enableAiFeatures
                            ? [
                                  {
                                      id: `creator-ai-${subPath.join('-')}`,
                                      label: 'Generate with AI',
                                      icon: 'sparkle',
                                      command: 'ansibleCreator.aiEntrySummary',
                                      args: [
                                          {
                                              label: cmdLabel,
                                              schema: subSchema,
                                              commandPath: subPath,
                                          },
                                      ],
                                  },
                              ]
                            : []),
                    ],
                });
            }
        }
    }
    return {
        id: `creator-cat-${path.join('-')}`,
        label,
        tooltip: schema.description ?? undefined,
        icon: 'folder',
        children: children.length > 0 ? children : undefined,
    };
}
