import type { SidebarSection, SidebarSnapshot, SidebarTreeNode } from '../src/sidebar/types';

const pluginActions = (fqcn: string): SidebarTreeNode['actions'] => [
    {
        id: `${fqcn}-docs`,
        label: 'View Documentation',
        icon: 'book',
        command: 'ansibleDevToolsCollections.showPluginDoc',
    },
    {
        id: `${fqcn}-ai`,
        label: 'Generate AI Summary',
        icon: 'sparkle',
        command: 'ansibleDevToolsCollections.aiPluginSummary',
    },
];

const collectionActions = (name: string): SidebarTreeNode['actions'] => [
    {
        id: `${name}-ai`,
        label: 'Generate AI Summary',
        icon: 'sparkle',
        command: 'ansibleDevToolsCollections.aiCollectionSummary',
    },
];

const playbookActions = (id: string): SidebarTreeNode['actions'] => [
    {
        id: `${id}-run`,
        label: 'Run Playbook',
        icon: 'play',
        command: 'ansiblePlaybooks.run',
    },
    {
        id: `${id}-progress`,
        label: 'Run with Progress Viewer',
        icon: 'graph',
        command: 'ansiblePlaybooks.runWithProgress',
    },
    {
        id: `${id}-ai`,
        label: 'Generate AI Summary',
        icon: 'sparkle',
        command: 'ansiblePlaybooks.aiSummary',
    },
];

const healthyEnvManagers: SidebarSection = {
    id: 'envManagers',
    title: 'Environment Managers',
    nodes: [
        {
            id: 'venv',
            label: 'Venv',
            icon: 'folder',
            children: [
                {
                    id: 'venv-ansible',
                    label: 'ansible-dev',
                    description: '3.12.8',
                    icon: 'check',
                    selected: true,
                },
                {
                    id: 'venv-other',
                    label: 'scratch',
                    description: '3.11.9',
                    icon: 'symbol-misc',
                },
            ],
        },
        {
            id: 'conda',
            label: 'Conda',
            icon: 'folder',
            children: [
                {
                    id: 'conda-base',
                    label: 'base',
                    description: '3.10.14',
                    icon: 'symbol-misc',
                },
            ],
        },
        {
            id: 'global',
            label: 'Global',
            icon: 'globe',
            warning: true,
            description: 'not recommended',
            children: [
                {
                    id: 'global-sys',
                    label: '/usr/bin/python3',
                    description: '3.13.0',
                    icon: 'symbol-misc',
                    warning: true,
                },
            ],
        },
    ],
};

const issueEnvManagers: SidebarSection = {
    id: 'envManagers',
    title: 'Environment Managers',
    severity: 'warning',
    welcome: 'No Python extension detected.',
    welcomeActions: [
        {
            id: 'install-python',
            label: 'Install Python Extension',
            command: 'workbench.extensions.search',
        },
    ],
    nodes: [],
};

const healthyDevTools: SidebarSection = {
    id: 'devTools',
    title: 'Ansible Dev Tools',
    nodes: [
        { id: 'pkg-ansible', label: 'ansible-core', description: '2.18.3', icon: 'package' },
        { id: 'pkg-lint', label: 'ansible-lint', description: '25.1.2', icon: 'package' },
        { id: 'pkg-creator', label: 'ansible-creator', description: '25.3.0', icon: 'package' },
        {
            id: 'pkg-ade',
            label: 'ansible-dev-environment',
            description: '25.4.0',
            icon: 'package',
        },
        { id: 'pkg-navigator', label: 'ansible-navigator', description: '25.4.0', icon: 'package' },
    ],
};

const issueDevTools: SidebarSection = {
    id: 'devTools',
    title: 'Ansible Dev Tools',
    severity: 'error',
    welcome: 'No ansible-dev-tools packages found.',
    welcomeActions: [
        {
            id: 'install-adt',
            label: 'Install ansible-dev-tools',
            command: 'ansibleDevToolsPackages.install',
        },
    ],
    nodes: [],
};

const collections: SidebarSection = {
    id: 'collections',
    title: 'Installed Collections',
    nodes: [
        {
            id: 'col-posix',
            label: 'ansible.posix',
            description: '2.0.0',
            icon: 'package',
            actions: collectionActions('ansible.posix'),
            children: [
                {
                    id: 'plugin-synchronize',
                    label: 'synchronize',
                    description: 'module',
                    icon: 'symbol-method',
                    actions: pluginActions('ansible.posix.synchronize'),
                },
                {
                    id: 'plugin-selinux',
                    label: 'selinux',
                    description: 'module',
                    icon: 'symbol-method',
                    actions: pluginActions('ansible.posix.selinux'),
                },
            ],
        },
        {
            id: 'col-general',
            label: 'community.general',
            description: '10.3.0',
            icon: 'package',
            actions: collectionActions('community.general'),
            children: [
                {
                    id: 'plugin-ini_file',
                    label: 'ini_file',
                    description: 'module',
                    icon: 'symbol-method',
                    actions: pluginActions('community.general.ini_file'),
                },
            ],
        },
    ],
};

const playbooks: SidebarSection = {
    id: 'playbooks',
    title: 'Playbooks',
    nodes: [
        {
            id: 'pb-site',
            label: 'site.yml',
            icon: 'file',
            actions: playbookActions('site'),
        },
        {
            id: 'pb-deploy',
            label: 'deploy.yml',
            icon: 'file',
            actions: playbookActions('deploy'),
        },
    ],
};

export type PlaygroundScenario = 'healthy' | 'missingPython' | 'missingAdt';

export function buildMockSnapshot(scenario: PlaygroundScenario): SidebarSnapshot {
    switch (scenario) {
        case 'missingPython':
            return {
                sections: [issueEnvManagers, healthyDevTools, collections, playbooks],
                suggestedOpenSectionId: 'envManagers',
            };
        case 'missingAdt':
            return {
                sections: [healthyEnvManagers, issueDevTools, collections, playbooks],
                suggestedOpenSectionId: 'devTools',
            };
        default:
            return {
                sections: [healthyEnvManagers, healthyDevTools, collections, playbooks],
                suggestedOpenSectionId: null,
            };
    }
}
