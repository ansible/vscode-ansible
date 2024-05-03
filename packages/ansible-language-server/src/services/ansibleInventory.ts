import { Connection } from "vscode-languageserver";
import { WorkspaceFolderContext } from "./workspaceManager";
import { CommandRunner } from "../utils/commandRunner";
import { URI } from "vscode-uri";

export type HostType = { host: string; priority: number };

type inventoryHostEntry = {
  children: string[];
  hosts: string[];
};

type inventoryType = Omit<
  {
    [name: string]: inventoryHostEntry;
  },
  "_meta"
>;

/* Example of minimal inventory object, anything else may be missing.


{
    "_meta": {
        "hostvars": {}
    },
    "all": {
        "children": [
            "ungrouped"
        ]
    }
}

Example of more complex inventory.
{
    "_meta": {
        "hostvars": {
            "foo.example.com": {
                "var_bool": true,
                "var_number": 1,
                "var_str": "bar"
            }
        }
    },
    "all": {
        "children": [
            "ungrouped",
            "webservers",
            "others"
        ]
    },
    "ungrouped": {
        "hosts": [
            "zoo"
        ]
    },
    "webservers": {
        "children": [
            "webservers-east",
            "webservers-west"
        ],
        "hosts": [
            "foo.example.com",
            "www01.example.com",
            "www02.example.com",
            "www03.example.com",
        ]
    }
}
*/

/**
 * Class to extend ansible-inventory executable as a service
 */
export class AnsibleInventory {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private _hostList: HostType[] = [];

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

    let inventoryHostsObject = {} as inventoryType;
    try {
      inventoryHostsObject = JSON.parse(
        ansibleInventoryResult.stdout,
      ) as inventoryType;
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
function parseInventoryHosts(hostObj: inventoryType): HostType[] {
  if (
    !(
      "all" in hostObj &&
      typeof hostObj.all === "object" &&
      "children" in hostObj.all &&
      Array.isArray(hostObj.all.children)
    )
  ) {
    return [];
  }
  const topLevelGroups = hostObj.all.children.filter(
    (item: string) => item !== "ungrouped",
  );

  const groupsHavingChildren = topLevelGroups.filter(
    (item) => hostObj[`${item}`] && hostObj[`${item}`].children,
  );

  const otherGroups = getChildGroups(groupsHavingChildren, hostObj);

  // Set priorities: top level groups (1), other groups (2), ungrouped (3), hosts for groups (4), localhost (5)
  const topLevelGroupsObjList = topLevelGroups.map((item) => {
    return { host: item, priority: 1 };
  });

  const otherGroupsObjList = otherGroups.map((item) => {
    return { host: item, priority: 2 };
  });

  const allGroups: HostType[] = [
    ...topLevelGroupsObjList,
    ...otherGroupsObjList,
  ];

  let ungroupedHostsObjList: HostType[] = [];

  if (
    "ungrouped" in hostObj &&
    typeof hostObj.ungrouped === "object" &&
    "hosts" in hostObj.ungrouped &&
    Array.isArray(hostObj.ungrouped.hosts) &&
    hostObj.ungrouped
  ) {
    ungroupedHostsObjList = hostObj.ungrouped.hosts.map((item) => {
      return { host: item, priority: 3 } as HostType;
    });
  }

  // Add 'localhost' and 'all' to the inventory list
  const localhostObj: HostType = { host: "localhost", priority: 5 };
  const allHostObj: HostType = { host: "all", priority: 6 };

  let allHosts = [localhostObj, allHostObj, ...ungroupedHostsObjList];

  for (const group of allGroups) {
    if (hostObj[`${group.host}`] && hostObj[`${group.host}`].hosts) {
      const hostsObj = hostObj[`${group.host}`].hosts.map((item) => {
        return { host: item, priority: 4 };
      });
      allHosts = [...allHosts, ...hostsObj];
    }
  }

  return [...allGroups, ...allHosts];
}

function getChildGroups(
  groupList: string[],
  hostObj: inventoryType,
  res: string[] = [],
): string[] {
  for (const host of groupList) {
    if (hostObj[`${host}`].children) {
      getChildGroups(hostObj[`${host}`].children, hostObj, res);
    } else {
      res.push(host);
    }
  }
  return res;
}
