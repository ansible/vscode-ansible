import * as ini from "ini";
import * as path from "path";
import _ from "lodash";
import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { getCommandService } from "@ansible/core/out/services/CommandService";
import type { WorkspaceFolderContext } from "./workspaceManager";

export interface AnsibleMetaData {
  [key: string]: string | undefined;
}

export class AnsibleConfig {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private _collectionPaths: string[] = [];
  private _moduleLocations: string[] = [];
  private _ansibleLocation = "";
  private _defaultHostList: string[] = [];
  private _ansibleMetaData: AnsibleMetaData = {};

  constructor(connection: Connection, context: WorkspaceFolderContext) {
    this.connection = connection;
    this.context = context;
  }

  public async initialize(): Promise<void> {
    try {
      const commandService = getCommandService();
      const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;

      const configResult = await commandService.runTool(
        "ansible-config",
        ["dump"],
        { cwd: workingDirectory },
      );
      let config = ini.parse(configResult.stdout);
      config = _.mapKeys(config, (_: unknown, key: string) =>
        key.substring(0, key.indexOf("(")),
      );

      this._collectionPaths =
        typeof config.COLLECTIONS_PATHS === "string"
          ? parsePythonStringArray(config.COLLECTIONS_PATHS)
          : [];

      this._defaultHostList =
        typeof config.DEFAULT_HOST_LIST === "string"
          ? parsePythonStringArray(config.DEFAULT_HOST_LIST)
          : [];

      const versionResult = await commandService.runTool("ansible", [
        "--version",
      ]);
      const versionInfo = ini.parse(versionResult.stdout);
      this._ansibleMetaData = versionInfo;
      this._moduleLocations = parsePythonStringArray(
        versionInfo["configured module search path"],
      );
      this._moduleLocations.push(
        path.resolve(versionInfo["ansible python module location"], "modules"),
      );
      this._ansibleLocation = versionInfo["ansible python module location"];
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

  get collectionPaths(): string[] {
    return this._collectionPaths;
  }

  get defaultHostList(): string[] {
    return this._defaultHostList;
  }

  get moduleLocations(): string[] {
    return this._moduleLocations;
  }

  get ansibleLocation(): string {
    return this._ansibleLocation;
  }

  get ansibleMetaData(): AnsibleMetaData {
    return this._ansibleMetaData;
  }
}

function parsePythonStringArray(stringList: string): string[] {
  if (!stringList || stringList.length < 2) return [];
  const cleaned = stringList.slice(1, stringList.length - 1);
  const quoted = cleaned.split(",").map((e) => e.trim());
  return quoted.map((e) => e.slice(1, e.length - 1));
}
