import {
  ClientCapabilities,
  Connection,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from 'vscode-languageserver';
import { AnsibleConfig } from './ansibleConfig';
import { AnsibleLint } from './ansibleLint';
import { DocsLibrary } from './docsLibrary';
import { MetadataLibrary } from './metadataLibrary';
import { SettingsManager } from './settingsManager';

export class WorkspaceManager {
  private connection: Connection;
  private sortedWorkspaceFolders: WorkspaceFolder[] = [];
  private folderContexts: Map<string, WorkspaceFolderContext> = new Map();
  private capabilities: ClientCapabilities = {};

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public setWorkspaceFolders(workspaceFolders: WorkspaceFolder[]): void {
    this.sortedWorkspaceFolders = this.sortWorkspaceFolders(workspaceFolders);
  }

  public setCapabilities(capabilities: ClientCapabilities): void {
    this.capabilities = capabilities;
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
          this.capabilities
        );
        this.folderContexts.set(workspaceFolder.uri, context);
      }
      return context;
    }
  }

  public forEachContext(
    callbackfn: (value: WorkspaceFolderContext) => void
  ): void {
    for (const folder of this.folderContexts.values()) {
      callbackfn(folder);
    }
  }

  /**
   * Finds the inner-most workspace folder for the given URI.
   */
  public getWorkspaceFolder(uri: string): WorkspaceFolder | undefined {
    for (const workspaceFolder of this.sortedWorkspaceFolders) {
      if (uri.startsWith(workspaceFolder.uri)) {
        return workspaceFolder;
      }
    }
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

export class WorkspaceFolderContext {
  private connection: Connection;
  public workspaceFolder: WorkspaceFolder;
  public documentMetadata: MetadataLibrary;
  public documentSettings: SettingsManager;

  // Lazy-loading anything that needs this context itself
  private _docsLibrary: Thenable<DocsLibrary> | undefined;
  private _ansibleConfig: Thenable<AnsibleConfig> | undefined;
  private _ansibleLint: AnsibleLint | undefined;

  constructor(
    connection: Connection,
    workspaceFolder: WorkspaceFolder,
    capabilities: ClientCapabilities
  ) {
    this.connection = connection;
    this.workspaceFolder = workspaceFolder;
    this.documentMetadata = new MetadataLibrary(connection);
    this.documentSettings = new SettingsManager(
      connection,
      !!(capabilities.workspace && !!capabilities.workspace.configuration)
    );
  }

  public get docsLibrary(): Thenable<DocsLibrary> {
    if (!this._docsLibrary) {
      const docsLibrary = new DocsLibrary(this);
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

  public get ansibleLint(): AnsibleLint {
    if (!this._ansibleLint) {
      this._ansibleLint = new AnsibleLint(this.connection, this);
    }
    return this._ansibleLint;
  }
}
