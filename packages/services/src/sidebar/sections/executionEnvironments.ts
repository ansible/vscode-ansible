/**
 * Execution Environments NavTree section.
 */
import {
    shortExecutionEnvironmentName,
    type SidebarNodeAction,
    type SidebarSection,
    type SidebarTreeNode,
} from '@ansible/common';
import type { SidebarModelInput } from '../types';

/**
 * Build Execution Environments (image list).
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildExecutionEnvironments(input: SidebarModelInput): SidebarSection {
    const headerActions: SidebarNodeAction[] = [
        {
            id: 'ee-build',
            label: 'Build from Definition',
            icon: 'package',
            command: 'ansibleExecutionEnvironments.buildFromDefinition',
        },
        ...(input.enableAiFeatures
            ? [
                  {
                      id: 'ee-ai',
                      label: 'AI Summary',
                      icon: 'sparkle',
                      command: 'ansibleExecutionEnvironments.aiSummary',
                  },
              ]
            : []),
        {
            id: 'ee-refresh',
            label: 'Refresh',
            icon: 'refresh',
            command: 'ansibleExecutionEnvironments.refresh',
        },
    ];
    if (input.executionEnvironmentsLoading) {
        return {
            id: 'executionEnvironments',
            title: 'Execution Environments',
            headerActions,
            nodes: [
                {
                    id: 'ee-loading',
                    label: 'Loading...',
                    icon: 'loading',
                    tooltip: 'Loading execution environments',
                },
            ],
        };
    }
    const eeError = input.executionEnvironmentsError;
    if (eeError) {
        const navigatorMissing =
            eeError.includes('not found in PATH') || eeError.includes('not found');
        if (navigatorMissing) {
            return {
                id: 'executionEnvironments',
                title: 'Execution Environments',
                headerActions,
                severity: 'warning',
                nodes: [
                    {
                        id: 'ee-navigator-missing',
                        label: 'ansible-navigator not found',
                        description: 'Click to install',
                        tooltip: 'Install ansible-dev-tools to enable Execution Environments',
                        icon: 'warning',
                        warning: true,
                        actions: [
                            {
                                id: 'ee-install-adt',
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
            id: 'executionEnvironments',
            title: 'Execution Environments',
            headerActions,
            severity: 'error',
            nodes: [
                {
                    id: 'ee-error',
                    label: 'Error loading execution environments',
                    description: eeError,
                    tooltip: eeError,
                    icon: 'error',
                    warning: true,
                },
            ],
        };
    }
    const ees = input.executionEnvironments ?? [];
    const nodes: SidebarTreeNode[] = ees.map((ee) => {
        const shortName = shortExecutionEnvironmentName(ee.full_name);
        return {
            id: `ee-${ee.full_name}`,
            label: shortName,
            // Created / full path live in tooltip — keep the row scannable
            tooltip: [ee.full_name, '', `Image ID: ${ee.image_id}`, `Created: ${ee.created}`].join(
                '\n',
            ),
            icon: 'package',
            // Native: Collapsed → Info / Collections / Python / System via loadDetails
            lazyChildren: true,
            expand: { kind: 'eeDetail', fullName: ee.full_name },
            actions: [
                {
                    id: `ee-detail-${ee.full_name}`,
                    label: 'Show Details',
                    icon: 'info',
                    command: 'ansibleExecutionEnvironments.showDetail',
                    // Native handler: (eeName: string)
                    args: [ee.full_name],
                },
                ...(input.enableAiFeatures
                    ? [
                          {
                              id: `ee-ai-${ee.full_name}`,
                              label: 'Generate AI Summary',
                              icon: 'sparkle',
                              command: 'ansibleExecutionEnvironments.aiEESummary',
                              args: [{ label: ee.full_name }],
                          },
                      ]
                    : []),
            ],
        };
    });
    return {
        id: 'executionEnvironments',
        title: 'Execution Environments',
        headerActions,
        nodes:
            nodes.length > 0
                ? nodes
                : [
                      {
                          id: 'ee-empty',
                          label: 'No execution environments found',
                          description: 'Build or pull an EE image',
                          tooltip: 'Build or pull an execution environment image',
                          icon: 'info',
                      },
                  ],
    };
}
