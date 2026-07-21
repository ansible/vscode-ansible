/**
 * Ansible Dev Tools NavTree section.
 */
import type { SidebarNodeAction, SidebarSection } from '@ansible/common';
import type { SidebarModelInput } from '../types';

const DEVTOOLS_HEADER_ACTIONS: SidebarNodeAction[] = [
    {
        id: 'adt-install',
        label: 'Install ansible-dev-tools',
        icon: 'cloud-download',
        command: 'ansibleDevToolsPackages.install',
    },
    {
        id: 'adt-upgrade',
        label: 'Upgrade ansible-dev-tools',
        icon: 'arrow-up',
        command: 'ansibleDevToolsPackages.upgrade',
    },
    {
        id: 'adt-refresh',
        label: 'Refresh',
        icon: 'refresh',
        command: 'ansibleDevToolsPackages.refresh',
    },
];
/**
 * Build the Ansible Dev Tools section.
 * @param input - Model inputs
 * @returns Section snapshot
 */
export function buildDevTools(input: SidebarModelInput): SidebarSection {
    if (!input.pythonAvailable) {
        return {
            id: 'devTools',
            title: 'Ansible Dev Tools',
            severity: 'warning',
            headerActions: DEVTOOLS_HEADER_ACTIONS,
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
    }
    if (!input.hasDevTools) {
        return {
            id: 'devTools',
            title: 'Ansible Dev Tools',
            severity: 'error',
            headerActions: DEVTOOLS_HEADER_ACTIONS,
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
    }
    return {
        id: 'devTools',
        title: 'Ansible Dev Tools',
        headerActions: DEVTOOLS_HEADER_ACTIONS,
        nodes: input.devTools.map((pkg) => ({
            id: `pkg-${pkg.name}`,
            label: pkg.name,
            description: pkg.version,
            icon: 'package',
            tooltip: pkg.location,
        })),
    };
}

/**
 *
 * @param input
 */
/**
 * Whether Dev Tools should auto-open (Python ok but ADT missing).
 * @param input - Snapshot inputs
 * @returns True when the section should be suggested open
 */
export function shouldSuggestDevTools(input: SidebarModelInput): boolean {
    return input.pythonAvailable && !input.hasDevTools;
}
