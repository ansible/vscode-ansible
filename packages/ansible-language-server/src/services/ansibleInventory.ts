import { Connection } from "vscode-languageserver";
import { WorkspaceFolderContext } from "./workspaceManager";
import { CommandRunner } from "../utils/commandRunner";
import { URI } from "vscode-uri";

type AnsibleHost = {
  host: string;
  priority: number;
};

type AnsibleHostObject = {
  [name: string]: {
    hosts?: string[];
    children?: string[];
  };
  _meta: object;
};
// & { _meta?: never };
/**
 * Class to extend ansible-inventory executable as a service
 */
export class AnsibleInventory {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private _hostList = [];

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async initialize() {
    const settings = await this.context.documentSettings.get(
      this.context.workspaceFolder.uri,
    );

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );

    const defaultHostListPath = new Set(
      (await this.context.ansibleConfig).default_host_list,
    );

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

    // Get inventory hosts
    const ansibleInventoryResult = await commandRunner.runCommand(
      "ansible-inventory",
      "--list",
      workingDirectory,
      defaultHostListPath,
    );

    let inventoryHostsObject: AnsibleHostObject;
    try {
      inventoryHostsObject = JSON.parse(
        ansibleInventoryResult.stdout,
      ) as AnsibleHostObject;
    } catch (error) {
      this.connection.console.error(
        `Exception in AnsibleInventory service: ${JSON.stringify(error)}`,
      );
    }

    this._hostList = parseInventoryHosts(inventoryHostsObject);
  }

  get hostList() {
    return this._hostList;
  }
}

/**
 * A utility function to parse the hosts object from ansible-inventory executable
 * to a more usable structure that can be used during auto-completions
 * @param hostObj - nested object of hosts
 * @returns an array of object with host and priority as keys
 */
function parseInventoryHosts(hostObj: AnsibleHostObject) {
  const topLevelGroups = hostObj.all.children.filter(
    (item: string) => item !== "ungrouped",
  );

  const groupsHavingChildren = topLevelGroups.filter(
    (item) => hostObj[`${item}`] && hostObj[`${item}`].children,
  );

  const otherGroups = getChildGroups(groupsHavingChildren, hostObj);

  // Set priorities: top level groups (1), other groups (2), ungrouped (3), hosts for groups (4), localhost (5)
  const topLevelGroupsObjList = topLevelGroups.map((item) => {
    return { host: item, priority: 1 } as AnsibleHost;
  });

  const otherGroupsObjList = otherGroups.map((item) => {
    return { host: item, priority: 2 } as AnsibleHost;
  });

  const allGroups = [...topLevelGroupsObjList, ...otherGroupsObjList];

  let ungroupedHostsObjList: AnsibleHost[] = [];
  if (hostObj.ungrouped) {
    ungroupedHostsObjList = hostObj.ungrouped.hosts.map((item) => {
      return { host: item, priority: 3 };
    });
  }

  // Add 'localhost' and 'all' to the inventory list
  const localhostObj = { host: "localhost", priority: 5 } as AnsibleHost;
  const allHostObj = { host: "all", priority: 6 } as AnsibleHost;

  let allHosts = [localhostObj, allHostObj, ...ungroupedHostsObjList];

  for (const group of allGroups) {
    if (hostObj[`${group.host}`] && hostObj[`${group.host}`].hosts) {
      const hostsObj = hostObj[`${group.host}`].hosts.map((item) => {
        return { host: item, priority: 4 } as AnsibleHost;
      });
      allHosts = [...allHosts, ...hostsObj];
    }
  }

  return [...allGroups, ...allHosts];
}

function getChildGroups(groupList, hostObj, res = []) {
  for (const host of groupList) {
    if (hostObj[`${host}`].children) {
      getChildGroups(hostObj[`${host}`].children, hostObj, res);
    } else {
      res.push(host);
    }
  }
  return res;
}
