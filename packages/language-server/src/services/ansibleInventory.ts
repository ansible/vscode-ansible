import { Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { getCommandService } from '@ansible/core/out/services/CommandService';
import type { WorkspaceFolderContext } from './workspaceManager';

export interface HostType {
    host: string;
    priority: number;
}

interface InventoryHostEntry {
    children?: string[];
    hosts?: string[];
}

type InventoryData = Record<string, InventoryHostEntry | undefined>;

/**
 * Loads and parses the Ansible inventory for a workspace folder.
 */
export class AnsibleInventory {
    private connection: Connection;
    private context: WorkspaceFolderContext;
    private _hostList: HostType[] = [];

    /**
     * Binds the inventory service to an LSP connection and workspace context.
     *
     * @param connection - LSP connection for error logging.
     * @param context - Workspace folder whose inventory is loaded.
     */
    constructor(connection: Connection, context: WorkspaceFolderContext) {
        this.connection = connection;
        this.context = context;
    }

    /**
     * Runs ansible-inventory --list and builds the host completion list.
     */
    public async initialize(): Promise<void> {
        const commandService = getCommandService();
        const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

        try {
            const result = await commandService.runTool('ansible-inventory', ['--list'], {
                cwd: workingDirectory,
            });

            let inventoryData: InventoryData = {};
            try {
                inventoryData = JSON.parse(result.stdout) as InventoryData;
            } catch (parseError) {
                this.connection.console.error(
                    `Exception in AnsibleInventory service: ${JSON.stringify(parseError)}`,
                );
            }

            this._hostList = parseInventoryHosts(inventoryData);
        } catch (error) {
            this.connection.console.error(
                `Exception in AnsibleInventory service: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
            );
        }
    }

    /**
     * Hosts and groups available for playbook completion, with sort priorities.
     *
     * @returns Prioritized inventory hosts and groups.
     */
    get hostList(): HostType[] {
        return this._hostList;
    }
}

/**
 * Flattens ansible-inventory JSON into prioritized host and group entries.
 *
 * @param hostObj - Parsed inventory tree from ansible-inventory --list.
 * @returns Host entries ordered for completion sorting.
 */
function parseInventoryHosts(hostObj: InventoryData): HostType[] {
    if (
        !('all' in hostObj) ||
        typeof hostObj.all !== 'object' ||
        !Array.isArray(hostObj.all.children)
    ) {
        return [];
    }

    const topLevelGroups = hostObj.all.children.filter((item: string) => item !== 'ungrouped');

    const groupsWithChildren = topLevelGroups.filter((item) => hostObj[item]?.children);

    const nestedGroups = getChildGroups(groupsWithChildren, hostObj);

    const topLevelGroupsList: HostType[] = topLevelGroups.map((item) => ({
        host: item,
        priority: 1,
    }));
    const nestedGroupsList: HostType[] = nestedGroups.map((item) => ({
        host: item,
        priority: 2,
    }));
    const allGroups = [...topLevelGroupsList, ...nestedGroupsList];

    let ungroupedHosts: HostType[] = [];
    if (hostObj.ungrouped && Array.isArray(hostObj.ungrouped.hosts)) {
        ungroupedHosts = hostObj.ungrouped.hosts.map((item) => ({
            host: item,
            priority: 3,
        }));
    }

    const allHosts: HostType[] = [
        { host: 'localhost', priority: 5 },
        { host: 'all', priority: 6 },
        ...ungroupedHosts,
    ];

    for (const group of allGroups) {
        const groupHosts = hostObj[group.host]?.hosts;
        if (groupHosts) {
            for (const h of groupHosts) {
                allHosts.push({ host: h, priority: 4 });
            }
        }
    }

    return [...allGroups, ...allHosts];
}

/**
 * Recursively collects leaf group names from nested inventory children.
 *
 * @param groupList - Top-level group names to traverse.
 * @param hostObj - Full inventory data tree.
 * @param result - Accumulator for discovered leaf groups.
 * @returns Leaf group names found under the given groups.
 */
function getChildGroups(
    groupList: string[],
    hostObj: InventoryData,
    result: string[] = [],
): string[] {
    for (const host of groupList) {
        const entry = hostObj[host];
        if (entry?.children) {
            getChildGroups(entry.children, hostObj, result);
        } else {
            result.push(host);
        }
    }
    return result;
}
