import * as path from 'path';
import { URI } from 'vscode-uri';
import {
    ClientCapabilities,
    Connection,
    DidChangeWatchedFilesParams,
    WorkspaceFolder,
    WorkspaceFoldersChangeEvent,
} from 'vscode-languageserver';
import { AnsibleConfig } from './ansibleConfig';
import { AnsibleLint } from './ansibleLint';
import { AnsiblePlaybook } from './ansiblePlaybook';
import { AnsibleInventory } from './ansibleInventory';
import { SettingsManager } from './settingsManager';
import { IDocumentMetadata } from '../interfaces/documentMeta';

/**
 * Maps document URIs to workspace folders and their per-folder service contexts.
 */
export class WorkspaceManager {
    public connection: Connection;
    private sortedWorkspaceFolders: WorkspaceFolder[] = [];
    private folderContexts = new Map<string, WorkspaceFolderContext>();
    public clientCapabilities: ClientCapabilities = {};

    /**
     * Creates a workspace manager for the given LSP connection.
     *
     * @param connection - LSP connection used for logging and notifications.
     */
    constructor(connection: Connection) {
        this.connection = connection;
    }

    /**
     * Replaces the sorted workspace folder list from initialize or change events.
     *
     * @param workspaceFolders - Workspace folders reported by the client.
     */
    public setWorkspaceFolders(workspaceFolders: WorkspaceFolder[]): void {
        this.sortedWorkspaceFolders = this.sortWorkspaceFolders(workspaceFolders);
    }

    /**
     * Stores client capabilities used by per-folder contexts.
     *
     * @param capabilities - Client capabilities from the initialize request.
     */
    public setCapabilities(capabilities: ClientCapabilities): void {
        this.clientCapabilities = capabilities;
    }

    /**
     * Returns or lazily creates the service context for a document URI.
     *
     * @param uri - Document URI whose workspace context is needed.
     * @returns Per-folder context, or undefined when no folder matches.
     */
    public getContext(uri: string): WorkspaceFolderContext | undefined {
        const workspaceFolder = this.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            let context = this.folderContexts.get(workspaceFolder.uri);
            if (!context) {
                context = new WorkspaceFolderContext(this.connection, workspaceFolder, this);
                this.folderContexts.set(workspaceFolder.uri, context);
            }
            return context;
        }
    }

    /**
     * Creates folder contexts for every known workspace folder that does not
     * already have one. Contexts are normally created lazily on first document
     * access; this eagerly materializes them so folder-wide operations (e.g.
     * inventory resync) work before any Ansible file is opened.
     */
    public ensureFolderContexts(): void {
        for (const folder of this.sortedWorkspaceFolders) {
            if (!this.folderContexts.has(folder.uri)) {
                this.folderContexts.set(
                    folder.uri,
                    new WorkspaceFolderContext(this.connection, folder, this),
                );
            }
        }
    }

    /**
     * Number of materialized workspace folder contexts.
     *
     * @returns Count of entries in the folder context map.
     */
    public get folderContextCount(): number {
        return this.folderContexts.size;
    }

    /**
     * Invokes a callback for every already-materialized workspace folder
     * context. Does not create contexts for folders that have never been
     * accessed; call {@link ensureFolderContexts} first when eager
     * materialization is required (e.g. inventory resync).
     *
     * @param callbackfn - Function run for each folder context.
     */
    public async forEachContext(
        callbackfn: (value: WorkspaceFolderContext) => Promise<void> | void,
    ): Promise<void> {
        await Promise.all(
            Array.from(this.folderContexts.values()).map((folder) =>
                Promise.resolve(callbackfn(folder)),
            ),
        );
    }

    /**
     * Resolves the workspace folder containing a URI, or synthesizes one from its path.
     *
     * @param uri - Document or resource URI to locate.
     * @returns Matching workspace folder, or a folder derived from the file path.
     */
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

    /**
     * Removes stale contexts and merges added folders after a workspace change.
     *
     * @param event - Workspace folders added and removed by the client.
     */
    public handleWorkspaceChanged(event: WorkspaceFoldersChangeEvent): void {
        const removedUris = new Set(event.removed.map((folder) => folder.uri));

        for (const removedUri of removedUris) {
            this.folderContexts.delete(removedUri);
        }

        const newWorkspaceFolders = this.sortedWorkspaceFolders.filter(
            (folder) => !removedUris.has(folder.uri),
        );
        newWorkspaceFolders.push(...event.added);
        this.sortedWorkspaceFolders = this.sortWorkspaceFolders(newWorkspaceFolders);
    }

    /**
     * Sorts folders longest-uri-first so nested folders match before parents.
     *
     * @param workspaceFolders - Folders to sort.
     * @returns Sorted copy of the folder list.
     */
    private sortWorkspaceFolders(workspaceFolders: WorkspaceFolder[]): WorkspaceFolder[] {
        return workspaceFolders.sort((a, b) => b.uri.length - a.uri.length);
    }
}

/**
 * Per-workspace-folder cache of Ansible services, settings, and document metadata.
 */
export class WorkspaceFolderContext {
    private connection: Connection;
    public clientCapabilities: ClientCapabilities;
    public workspaceFolder: WorkspaceFolder;
    public documentMetadata = new Map<string, IDocumentMetadata>();
    public documentSettings: SettingsManager;

    private _ansibleConfig: Thenable<AnsibleConfig> | undefined;
    private _ansibleInventory: Thenable<AnsibleInventory> | undefined;
    private _ansibleLint: AnsibleLint | undefined;
    private _ansiblePlaybook: AnsiblePlaybook | undefined;

    /**
     * Initializes settings and invalidation hooks for a workspace folder.
     *
     * @param connection - LSP connection for service construction.
     * @param workspaceFolder - Folder this context represents.
     * @param workspaceManager - Parent manager providing client capabilities.
     */
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
        this.documentSettings.onConfigurationChanged(this.workspaceFolder.uri, () => {
            this._ansibleConfig = undefined;
            this._ansibleInventory = undefined;
        });
    }

    /**
     * Clears cached Ansible config when watched config files change.
     *
     * @param params - Watched file change notification from the client.
     */
    public handleWatchedDocumentChange(params: DidChangeWatchedFilesParams): void {
        for (const fileEvent of params.changes) {
            if (fileEvent.uri.startsWith(this.workspaceFolder.uri)) {
                this._ansibleConfig = undefined;
            }
        }
    }

    /**
     * Lazily loaded Ansible configuration for this workspace folder.
     *
     * @returns Promise that resolves to the initialized config service.
     */
    public get ansibleConfig(): Thenable<AnsibleConfig> {
        if (!this._ansibleConfig) {
            const config = new AnsibleConfig(this.connection, this);
            this._ansibleConfig = config.initialize().then(() => config);
        }
        return this._ansibleConfig;
    }

    /**
     * Lazily loaded Ansible inventory for this workspace folder.
     *
     * @returns Promise that resolves to the initialized inventory service.
     */
    public get ansibleInventory(): Thenable<AnsibleInventory> {
        if (!this._ansibleInventory) {
            const inventory = new AnsibleInventory(this.connection, this);
            this._ansibleInventory = inventory.initialize().then(() => inventory);
        }
        return this._ansibleInventory;
    }

    /** Forces the inventory cache to reload on the next access. */
    public clearAnsibleInventory(): void {
        this._ansibleInventory = undefined;
    }

    /** Clears lazily initialized Ansible config and inventory services. */
    public clearCachedServices(): void {
        this._ansibleConfig = undefined;
        this._ansibleInventory = undefined;
    }

    /**
     * Shared ansible-lint validator instance for this workspace folder.
     *
     * @returns Cached AnsibleLint service for the folder.
     */
    public get ansibleLint(): AnsibleLint {
        this._ansibleLint ??= new AnsibleLint(this.connection, this);
        return this._ansibleLint;
    }

    /**
     * Shared ansible-playbook syntax-check instance for this workspace folder.
     *
     * @returns Cached AnsiblePlaybook service for the folder.
     */
    public get ansiblePlaybook(): AnsiblePlaybook {
        this._ansiblePlaybook ??= new AnsiblePlaybook(this.connection, this);
        return this._ansiblePlaybook;
    }
}
