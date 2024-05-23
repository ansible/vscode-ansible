import * as ini from "ini";
import * as _ from "lodash";
import * as path from "path";
import { URI } from "vscode-uri";
import { Connection } from "vscode-languageserver";
import { WorkspaceFolderContext } from "./workspaceManager";
import { CommandRunner } from "../utils/commandRunner";
import { ansibleMetaDataType } from "../utils/getAnsibleMetaData";

export class AnsibleConfig {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private _collection_paths: string[] = [];
  private _module_locations: string[] = [];
  private _ansible_location = "";
  private _default_host_list: string[] = [];
  private _ansible_meta_data = {}; // ini data

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async initialize(): Promise<void> {
    try {
      const settings = await this.context.documentSettings.get(
        this.context.workspaceFolder.uri,
      );
      const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
      const mountPaths = new Set([workingDirectory]);
      const commandRunner = new CommandRunner(
        this.connection,
        this.context,
        settings,
      );

      // get Ansible configuration
      const ansibleConfigResult = await commandRunner.runCommand(
        "ansible-config",
        "dump",
        workingDirectory,
        mountPaths,
      );
      let config = ini.parse(ansibleConfigResult.stdout);
      config = _.mapKeys(
        config,
        (_, key) => key.substring(0, key.indexOf("(")), // remove config source in parenthesis
      );
      if (typeof config.COLLECTIONS_PATHS === "string") {
        this._collection_paths = parsePythonStringArray(
          config.COLLECTIONS_PATHS,
        );
      } else {
        this._collection_paths = [];
      }

      // get default host list from config dump
      if (typeof config.DEFAULT_HOST_LIST === "string") {
        this._default_host_list = parsePythonStringArray(
          config.DEFAULT_HOST_LIST,
        );
      } else {
        this._default_host_list = [];
      }

      // get Ansible basic information
      const ansibleVersionResult = await commandRunner.runCommand(
        "ansible",
        "--version",
      );

      const versionInfo = ini.parse(ansibleVersionResult.stdout);
      this._ansible_meta_data = versionInfo;
      this._module_locations = parsePythonStringArray(
        versionInfo["configured module search path"],
      );
      this._module_locations.push(
        path.resolve(versionInfo["ansible python module location"], "modules"),
      );

      this._ansible_location = versionInfo["ansible python module location"];

      // get Python sys.path
      // this is needed to get the pre-installed collections to work
      const pythonPathResult = await commandRunner.runCommand(
        "python3",
        ' -c "import sys; print(sys.path, end=\\"\\")"',
      );
      this._collection_paths.push(
        ...parsePythonStringArray(pythonPathResult.stdout),
      );
    } catch (error) {
      if (error instanceof Error) {
        this.connection.window.showErrorMessage(error.message);
      } else {
        this.connection.console.error(
          `Exception in AnsibleConfig service: ${JSON.stringify(error)}`,
        );
      }
    }
  }

  set collections_paths(updatedCollectionPath: string[]) {
    this._collection_paths = updatedCollectionPath;
  }

  get collections_paths(): string[] {
    return this._collection_paths;
  }

  set default_host_list(defaultHostList: string[]) {
    this._default_host_list = defaultHostList;
  }

  get default_host_list(): string[] {
    return this._default_host_list;
  }

  set module_locations(updatedModulesPath: string[]) {
    this._module_locations = updatedModulesPath;
  }

  get module_locations(): string[] {
    return this._module_locations;
  }

  public get ansible_location(): string {
    return this._ansible_location;
  }

  public get ansible_meta_data(): ansibleMetaDataType {
    return this._ansible_meta_data;
  }
}

function parsePythonStringArray(string_list: string): string[] {
  const cleaned_str = string_list.slice(1, string_list.length - 1); // remove []
  const quoted_elements = cleaned_str.split(",").map((e) => e.trim());
  return quoted_elements.map((e) => e.slice(1, e.length - 1));
}
