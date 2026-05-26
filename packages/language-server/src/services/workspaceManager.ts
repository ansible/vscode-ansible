import * as path from "path";
import { URI } from "vscode-uri";
import {
  ClientCapabilities,
  Connection,
  DidChangeWatchedFilesParams,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from "vscode-languageserver";
import { AnsibleConfig } from "./ansibleConfig";
import { AnsibleLint } from "./ansibleLint";
import { AnsiblePlaybook } from "./ansiblePlaybook";
import { AnsibleInventory } from "./ansibleInventory";
import { SettingsManager } from "./settingsManager";
import { IDocumentMetadata } from "../interfaces/documentMeta";

export class WorkspaceManager {
  public connection: Connection;
  private sortedWorkspaceFolders: WorkspaceFolder[] = [];
  private folderContexts: Map<string, WorkspaceFolderContext> = new Map();
  public clientCapabilities: ClientCapabilities = {};

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public setWorkspaceFolders(workspaceFolders: WorkspaceFolder[]): void {
    this.sortedWorkspaceFolders = this.sortWorkspaceFolders(workspaceFolders);
  }

  public setCapabilities(capabilities: ClientCapabilities): void {
    this.clientCapabilities = capabilities;
  }

  public getContext(uri: string): WorkspaceFolderContext | undefined {
    const workspaceFolder = this.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      let context = this.folderContexts.get(workspaceFolder.uri);
      if (!context) {
        context = new WorkspaceFolderContext(
          this.connection,
          workspaceFolder,
          this,
        );
        this.folderContexts.set(workspaceFolder.uri, context);
      }
      return context;
    }
  }

  public async forEachContext(
    callbackfn: (value: WorkspaceFolderContext) => Promise<void> | void,
  ): Promise<void> {
    await Promise.all(
      Array.from(this.folderContexts.values()).map((folder) =>
        callbackfn(folder),
      ),
    );
  }

  public getWorkspaceFolder(uri: string): WorkspaceFolder | undefined {
    for (const workspaceFolder of this.sortedWorkspaceFolders) {
      if (URI.parse(uri).toString().startsWith(workspaceFolder.uri)) {
        return workspaceFolder;
      }
    }

    const parsedUri = URI.parse(uri);
    const filePath = parsedUri.path;
    const folderPath = path.dirname(filePath);
    const folderName = path.basename(folderPath);
    const workspaceFolder: WorkspaceFolder = {
      uri: URI.file(folderPath).toString(),
      name: folderName,
    };

    this.connection.console.log(
      `workspace folder explicitly set to ${URI.parse(workspaceFolder.uri).path}`,
    );
    return workspaceFolder;
  }

  public handleWorkspaceChanged(event: WorkspaceFoldersChangeEvent): void {
    const removedUris = new Set(event.removed.map((folder) => folder.uri));

    for (const removedUri of removedUris) {
      this.folderContexts.delete(removedUri);
    }

    const newWorkspaceFolders = this.sortedWorkspaceFolders.filter(
      (folder) => !removedUris.has(folder.uri),
    );
    newWorkspaceFolders.push(...event.added);
    this.sortedWorkspaceFolders =
      this.sortWorkspaceFolders(newWorkspaceFolders);
  }

  private sortWorkspaceFolders(
    workspaceFolders: WorkspaceFolder[],
  ): WorkspaceFolder[] {
    return workspaceFolders.sort((a, b) => b.uri.length - a.uri.length);
  }
}

export class WorkspaceFolderContext {
  private connection: Connection;
  public clientCapabilities: ClientCapabilities;
  public workspaceFolder: WorkspaceFolder;
  public documentMetadata: Map<string, IDocumentMetadata> = new Map();
  public documentSettings: SettingsManager;

  private _ansibleConfig: Thenable<AnsibleConfig> | undefined;
  private _ansibleInventory: Thenable<AnsibleInventory> | undefined;
  private _ansibleLint: AnsibleLint | undefined;
  private _ansiblePlaybook: AnsiblePlaybook | undefined;

  constructor(
    connection: Connection,
    workspaceFolder: WorkspaceFolder,
    workspaceManager: WorkspaceManager,
  ) {
    this.connection = connection;
    this.clientCapabilities = workspaceManager.clientCapabilities;
    this.workspaceFolder = workspaceFolder;
    this.documentSettings = new SettingsManager(
      connection,
      !!this.clientCapabilities.workspace?.configuration,
    );
    this.documentSettings.onConfigurationChanged(
      this.workspaceFolder.uri,
      () => {
        this._ansibleConfig = undefined;
        this._ansibleInventory = undefined;
      },
    );
  }

  public handleWatchedDocumentChange(
    params: DidChangeWatchedFilesParams,
  ): void {
    for (const fileEvent of params.changes) {
      if (fileEvent.uri.startsWith(this.workspaceFolder.uri)) {
        this._ansibleConfig = undefined;
      }
    }
  }

  public get ansibleConfig(): Thenable<AnsibleConfig> {
    if (!this._ansibleConfig) {
      const config = new AnsibleConfig(this.connection, this);
      this._ansibleConfig = config.initialize().then(() => config);
    }
    return this._ansibleConfig;
  }

  public get ansibleInventory(): Thenable<AnsibleInventory> {
    if (!this._ansibleInventory) {
      const inventory = new AnsibleInventory(this.connection, this);
      this._ansibleInventory = inventory.initialize().then(() => inventory);
    }
    return this._ansibleInventory;
  }

  public clearAnsibleInventory(): void {
    this._ansibleInventory = undefined;
  }

  public clearCachedServices(): void {
    this._ansibleConfig = undefined;
    this._ansibleInventory = undefined;
  }

  public get ansibleLint(): AnsibleLint {
    if (!this._ansibleLint) {
      this._ansibleLint = new AnsibleLint(this.connection, this);
    }
    return this._ansibleLint;
  }

  public get ansiblePlaybook(): AnsiblePlaybook {
    if (!this._ansiblePlaybook) {
      this._ansiblePlaybook = new AnsiblePlaybook(this.connection, this);
    }
    return this._ansiblePlaybook;
  }
}
