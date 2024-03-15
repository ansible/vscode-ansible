import * as _ from "lodash";
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
import { DocsLibrary } from "./docsLibrary";
import { ExecutionEnvironment } from "./executionEnvironment";
import { MetadataLibrary } from "./metadataLibrary";
import { SettingsManager } from "./settingsManager";
import * as path from "path";
import { URI } from "vscode-uri";
import { AnsibleInventory } from "./ansibleInventory";

/**
 * Holds the overall context for the whole workspace.
 */
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

  /**
   * Determines the workspace folder context for the given URI.
   */
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
      _.map(Array.from(this.folderContexts.values()), (folder) =>
        callbackfn(folder),
      ),
    );
  }

  /**
   * Finds the inner-most workspace folder for the given URI.
   */
  public getWorkspaceFolder(uri: string): WorkspaceFolder | undefined {
    for (const workspaceFolder of this.sortedWorkspaceFolders) {
      if (URI.parse(uri).toString().startsWith(workspaceFolder.uri)) {
        return workspaceFolder;
      }
    }
    /* *
     * If control reaches at this point it indicates an individual file is
     * opened in client without any workspace.
     * Set the workspace to directory of the file pointed by uri.
     */
    const documentFolderPathParts = URI.parse(uri).toString().split(path.sep);
    documentFolderPathParts.pop();
    const workspaceFolder: WorkspaceFolder = {
      uri: documentFolderPathParts.join(path.sep),
      name: documentFolderPathParts[documentFolderPathParts.length - 1],
    };

    this.connection.console.log(
      `workspace folder explicitly set to ${
        URI.parse(workspaceFolder.uri).path
      }`,
    );
    return workspaceFolder;
  }

  public handleWorkspaceChanged(event: WorkspaceFoldersChangeEvent): void {
    const removedUris = new Set(event.removed.map((folder) => folder.uri));

    // We only keep contexts of existing workspace folders
    for (const removedUri of removedUris) {
      this.folderContexts.delete(removedUri);
    }

    const newWorkspaceFolders = this.sortedWorkspaceFolders.filter((folder) => {
      return !removedUris.has(folder.uri);
    });
    newWorkspaceFolders.push(...event.added);
    this.sortedWorkspaceFolders =
      this.sortWorkspaceFolders(newWorkspaceFolders);
  }

  private sortWorkspaceFolders(workspaceFolders: WorkspaceFolder[]) {
    return workspaceFolders.sort((a, b) => {
      return b.uri.length - a.uri.length;
    });
  }
}

/**
 * Holds the context for particular workspace folder. This context is used by
 * all services to interact with the client and with each other.
 */
export class WorkspaceFolderContext {
  private connection: Connection;
  public clientCapabilities: ClientCapabilities;
  public workspaceFolder: WorkspaceFolder;
  public documentMetadata: MetadataLibrary;
  public documentSettings: SettingsManager;

  // Lazy-loading anything that needs this context itself
  private _executionEnvironment: Thenable<ExecutionEnvironment> | undefined;
  private _docsLibrary: Thenable<DocsLibrary> | undefined;
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
    this.documentMetadata = new MetadataLibrary(connection);
    this.documentSettings = new SettingsManager(
      connection,
      !!this.clientCapabilities.workspace?.configuration,
    );
    this.documentSettings.onConfigurationChanged(
      this.workspaceFolder.uri,
      () => {
        // in case the configuration changes for this folder, we should
        // invalidate the services that rely on it in initialization
        this._executionEnvironment = undefined;
        this._ansibleConfig = undefined;
        this._docsLibrary = undefined;
        this._ansibleInventory = undefined;
      },
    );
  }

  public handleWatchedDocumentChange(
    params: DidChangeWatchedFilesParams,
  ): void {
    this.documentMetadata.handleWatchedDocumentChange(params);
    for (const fileEvent of params.changes) {
      if (fileEvent.uri.startsWith(this.workspaceFolder.uri)) {
        // in case the configuration changes for this folder, we should
        // invalidate the services that rely on it in initialization
        this._executionEnvironment = undefined;
        this._ansibleConfig = undefined;
        this._docsLibrary = undefined;
      }
    }
  }

  public get docsLibrary(): Thenable<DocsLibrary> {
    if (!this._docsLibrary) {
      const docsLibrary = new DocsLibrary(this.connection, this);
      this._docsLibrary = docsLibrary.initialize().then(() => docsLibrary);
    }
    return this._docsLibrary;
  }

  public get ansibleConfig(): Thenable<AnsibleConfig> {
    if (!this._ansibleConfig) {
      const ansibleConfig = new AnsibleConfig(this.connection, this);
      this._ansibleConfig = ansibleConfig
        .initialize()
        .then(() => ansibleConfig);
    }
    return this._ansibleConfig;
  }

  public get ansibleInventory(): Thenable<AnsibleInventory> {
    if (!this._ansibleInventory) {
      const ansibleInventory = new AnsibleInventory(this.connection, this);
      this._ansibleInventory = ansibleInventory
        .initialize()
        .then(() => ansibleInventory);
    }
    return this._ansibleInventory;
  }

  public clearAnsibleInventory(): void {
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

  public get executionEnvironment(): Thenable<ExecutionEnvironment> {
    if (!this._executionEnvironment) {
      const executionEnvironment = new ExecutionEnvironment(
        this.connection,
        this,
      );
      this._executionEnvironment = executionEnvironment
        .initialize()
        .then(() => executionEnvironment);
    }
    return this._executionEnvironment;
  }
}
