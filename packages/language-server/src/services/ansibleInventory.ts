import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { getCommandService } from "@ansible/core/out/services/CommandService";
import type { WorkspaceFolderContext } from "./workspaceManager";

export type HostType = { host: string; priority: number };

interface InventoryHostEntry {
  children?: string[];
  hosts?: string[];
}

type InventoryData = {
  [name: string]: InventoryHostEntry;
};

export class AnsibleInventory {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private _hostList: HostType[] = [];

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async initialize(): Promise<void> {
    const commandService = getCommandService();
    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

    try {
      const result = await commandService.runTool(
        "ansible-inventory",
        ["--list"],
        { cwd: workingDirectory },
      );

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

  get hostList(): HostType[] {
    return this._hostList;
  }
}

function parseInventoryHosts(hostObj: InventoryData): HostType[] {
  if (
    !("all" in hostObj) ||
    typeof hostObj.all !== "object" ||
    !Array.isArray(hostObj.all.children)
  ) {
    return [];
  }

  const topLevelGroups = hostObj.all.children.filter(
    (item: string) => item !== "ungrouped",
  );

  const groupsWithChildren = topLevelGroups.filter(
    (item) => hostObj[item]?.children,
  );

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
  if (
    hostObj.ungrouped &&
    Array.isArray(hostObj.ungrouped.hosts)
  ) {
    ungroupedHosts = hostObj.ungrouped.hosts.map((item) => ({
      host: item,
      priority: 3,
    }));
  }

  const allHosts: HostType[] = [
    { host: "localhost", priority: 5 },
    { host: "all", priority: 6 },
    ...ungroupedHosts,
  ];

  for (const group of allGroups) {
    if (hostObj[group.host]?.hosts) {
      for (const h of hostObj[group.host].hosts!) {
        allHosts.push({ host: h, priority: 4 });
      }
    }
  }

  return [...allGroups, ...allHosts];
}

function getChildGroups(
  groupList: string[],
  hostObj: InventoryData,
  result: string[] = [],
): string[] {
  for (const host of groupList) {
    if (hostObj[host]?.children) {
      getChildGroups(hostObj[host].children!, hostObj, result);
    } else {
      result.push(host);
    }
  }
  return result;
}
