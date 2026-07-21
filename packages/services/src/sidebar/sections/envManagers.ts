/**
 * Environment Managers NavTree section.
 */
import type { SidebarNodeAction, SidebarSection, SidebarTreeNode } from '@ansible/common';
import type { SidebarModelInput } from '../types';

const ENV_HEADER_ACTIONS: SidebarNodeAction[] = [
    {
        id: 'env-create',
        label: 'Create Environment',
        icon: 'add',
        command: 'ansibleDevToolsEnvManagers.create',
    },
    {
        id: 'env-refresh',
        label: 'Refresh',
        icon: 'refresh',
        command: 'ansibleDevToolsEnvManagers.refresh',
    },
];
/**
 * Build the Environment Managers section.
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildEnvManagers(input: SidebarModelInput): SidebarSection {
    if (!input.pythonAvailable) {
        return {
            id: 'envManagers',
            title: 'Environment Managers',
            severity: 'warning',
            headerActions: ENV_HEADER_ACTIONS,
            welcome: 'No Python extension detected.',
            welcomeActions: [
                {
                    id: 'install-python',
                    label: 'Install Python Extension',
                    command: 'workbench.extensions.search',
                    args: ['ms-python.python'],
                },
            ],
            nodes: [],
        };
    }
    // Native viewsWelcome when ansible.pythonEnvCapability == python-only
    if (input.pythonEnvCapability === 'python-only' && input.envManagers.length === 0) {
        return {
            id: 'envManagers',
            title: 'Environment Managers',
            severity: 'info',
            headerActions: ENV_HEADER_ACTIONS,
            welcome:
                'Environment management uses terminal fallbacks.\nFor the best experience, install the Python Environments extension.',
            welcomeActions: [
                {
                    id: 'install-python-envs',
                    label: 'Install Python Environments',
                    command: 'workbench.extensions.search',
                    args: ['ms-python.vscode-python-envs'],
                },
                {
                    id: 'create-venv',
                    label: 'Create Virtual Environment',
                    command: 'ansibleDevToolsEnvManagers.create',
                },
            ],
            nodes: [],
        };
    }
    // Native: manager "not recommended" only when a global env is selected
    const globalEnvSelected = input.envManagers.some(
        (m) => m.isGlobal && m.environments.some((e) => e.selected),
    );
    const nodes: SidebarTreeNode[] = input.envManagers.map((manager) => ({
        id: manager.id,
        label: manager.name,
        icon: manager.isGlobal ? 'globe' : 'folder',
        warning: manager.isGlobal && globalEnvSelected,
        description: manager.isGlobal && globalEnvSelected ? 'not recommended' : undefined,
        tooltip:
            manager.isGlobal && globalEnvSelected
                ? 'Global Python Environment Selected\n\n' +
                  'Use of global Python environments for Ansible development is strongly discouraged.\n\n' +
                  'Please create and select a virtual environment instead.'
                : undefined,
        children: manager.environments.map((env) => {
            const lines: string[] = [];
            if (manager.isGlobal) {
                lines.push('Not recommended for Ansible development', '');
            }
            lines.push(env.label);
            if (env.version) {
                lines.push('', `Version: ${env.version}`);
            }
            if (env.path) {
                lines.push('', `Path: ${env.path}`);
            }
            return {
                id: env.id,
                label: env.label,
                description: env.version,
                tooltip: lines.join('\n'),
                icon: env.selected ? 'check' : 'symbol-misc',
                selected: env.selected,
                warning: env.warning ?? manager.isGlobal,
                actions: [
                    {
                        id: `select-${env.id}`,
                        label: 'Select Environment',
                        icon: 'check',
                        command: 'ansibleDevTools.selectEnvironment',
                        // Host resolves envId → full PythonEnvironment
                        args: [{ envId: env.id }],
                    },
                ],
            };
        }),
    }));
    if (input.pythonEnvCapability === 'python-only') {
        nodes.unshift({
            id: 'env-python-only-hint',
            label: 'Using terminal fallbacks — install Python Environments for the best experience',
            icon: 'info',
            actions: [
                {
                    id: 'install-python-envs-inline',
                    label: 'Install Python Environments',
                    icon: 'extensions',
                    command: 'workbench.extensions.search',
                    args: ['ms-python.vscode-python-envs'],
                },
            ],
        });
    }
    return {
        id: 'envManagers',
        title: 'Environment Managers',
        headerActions: ENV_HEADER_ACTIONS,
        severity: input.pythonEnvCapability === 'python-only' ? 'info' : undefined,
        nodes,
    };
}

/**
 *
 * @param input
 */
/**
 * Whether Environment Managers should auto-open (Python unavailable).
 * @param input - Snapshot inputs
 * @returns True when the section should be suggested open
 */
export function shouldSuggestEnvManagers(input: SidebarModelInput): boolean {
    return !input.pythonAvailable;
}
