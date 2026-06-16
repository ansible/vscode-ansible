import {
    Connection,
    DidChangeConfigurationNotification,
    DidChangeWatchedFilesNotification,
    InitializeParams,
    InitializeResult,
    TextDocuments,
    TextDocumentSyncKind,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { doCompletion, doCompletionResolve } from './providers/completionProvider';
import { doHover } from './providers/hoverProvider';
import { doSemanticTokens, tokenModifiers, tokenTypes } from './providers/semanticTokenProvider';
import { doValidate } from './providers/validationProvider';
import { ValidationManager } from './services/validationManager';
import { WorkspaceManager } from './services/workspaceManager';
import { getAnsibleMetaData } from './utils/getAnsibleMetaData';
import { CollectionsService } from '@ansible/services';

/**
 * Wires LSP lifecycle events to Ansible language features for a workspace.
 */
export class AnsibleLanguageService {
    private connection: Connection;
    private documents: TextDocuments<TextDocument>;

    private workspaceManager: WorkspaceManager;
    private validationManager: ValidationManager;

    /**
     * Creates the language service and its workspace and validation managers.
     *
     * @param connection - LSP connection used to register handlers.
     * @param documents - Managed text document collection.
     */
    constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
        this.connection = connection;
        this.documents = documents;
        this.workspaceManager = new WorkspaceManager(connection);
        this.validationManager = new ValidationManager(connection, documents);
    }

    /**
     * Registers initialization handlers and document lifecycle listeners.
     */
    public initialize(): void {
        this.initializeConnection();
        this.registerLifecycleEventHandlers();
    }

    /**
     * Configures server capabilities and workspace folder support on initialize.
     */
    private initializeConnection(): void {
        this.connection.onInitialize((params: InitializeParams) => {
            this.workspaceManager.setWorkspaceFolders(params.workspaceFolders ?? []);
            this.workspaceManager.setCapabilities(params.capabilities);

            const result: InitializeResult = {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,
                    semanticTokensProvider: {
                        documentSelector: [{ language: 'ansible' }],
                        full: true,
                        legend: {
                            tokenTypes: [...tokenTypes],
                            tokenModifiers: [...tokenModifiers],
                        },
                    },
                    hoverProvider: true,
                    completionProvider: {
                        resolveProvider: true,
                    },
                    workspace: {},
                },
            };

            if (this.workspaceManager.clientCapabilities.workspace?.workspaceFolders) {
                result.capabilities.workspace = {
                    workspaceFolders: {
                        supported: true,
                        changeNotifications: true,
                    },
                };
            }
            return result;
        });

        this.connection.onInitialized(() => {
            if (this.workspaceManager.clientCapabilities.workspace?.configuration) {
                void this.connection.client.register(DidChangeConfigurationNotification.type, {
                    section: 'ansible',
                });
            }
            if (this.workspaceManager.clientCapabilities.workspace?.workspaceFolders) {
                this.connection.workspace.onDidChangeWorkspaceFolders((e) => {
                    this.workspaceManager.handleWorkspaceChanged(e);
                });
            }
            void this.connection.client.register(DidChangeWatchedFilesNotification.type, {
                watchers: [
                    { globPattern: '**/ansible.cfg' },
                    { globPattern: '**/.ansible-lint' },
                    { globPattern: '**/meta/main.{yml,yaml}' },
                ],
            });
        });
    }

    /**
     * Subscribes to document, configuration, and feature request events.
     */
    private registerLifecycleEventHandlers(): void {
        this.connection.onDidChangeConfiguration((params) => {
            void (async () => {
                try {
                    await this.workspaceManager.forEachContext((context) =>
                        context.documentSettings.handleConfigurationChanged(params),
                    );
                } catch (error) {
                    this.handleError(error, 'onDidChangeConfiguration');
                }
            })();
        });

        this.documents.onDidOpen(async (e) => {
            try {
                const context = this.workspaceManager.getContext(e.document.uri);
                if (context) {
                    await doValidate(
                        e.document,
                        this.validationManager,
                        false,
                        context,
                        this.connection,
                    );
                }
            } catch (error) {
                this.handleError(error, 'onDidOpen');
            }
        });

        this.documents.onDidClose((e) => {
            try {
                this.validationManager.handleDocumentClosed(e.document.uri);
                const context = this.workspaceManager.getContext(e.document.uri);
                if (context) {
                    context.documentSettings.handleDocumentClosed(e.document.uri);
                }
            } catch (error) {
                this.handleError(error, 'onDidClose');
            }
        });

        this.connection.onDidChangeWatchedFiles((params) => {
            try {
                void this.workspaceManager.forEachContext((context) => {
                    context.handleWatchedDocumentChange(params);
                });
            } catch (error) {
                this.handleError(error, 'onDidChangeWatchedFiles');
            }
        });

        this.documents.onDidSave(async (e) => {
            try {
                const context = this.workspaceManager.getContext(e.document.uri);
                if (context) {
                    await doValidate(
                        e.document,
                        this.validationManager,
                        false,
                        context,
                        this.connection,
                    );
                }
            } catch (error) {
                this.handleError(error, 'onDidSave');
            }
        });

        this.connection.onDidChangeTextDocument((e) => {
            try {
                this.validationManager.reconcileCacheItems(e.textDocument.uri, e.contentChanges);
            } catch (error) {
                this.handleError(error, 'onDidChangeTextDocument');
            }
        });

        this.documents.onDidChangeContent(async (e) => {
            try {
                await doValidate(
                    e.document,
                    this.validationManager,
                    true,
                    this.workspaceManager.getContext(e.document.uri),
                    this.connection,
                );
            } catch (error) {
                this.handleError(error, 'onDidChangeContent');
            }
        });

        this.connection.languages.semanticTokens.on(async (params) => {
            try {
                const document = this.documents.get(params.textDocument.uri);
                if (document) {
                    const context = this.workspaceManager.getContext(params.textDocument.uri);
                    if (context) {
                        const collectionsService = CollectionsService.getInstance();
                        return await doSemanticTokens(document, collectionsService);
                    }
                }
            } catch (error) {
                this.handleError(error, 'onSemanticTokens');
            }
            return { data: [] };
        });

        this.connection.onHover(async (params) => {
            try {
                const document = this.documents.get(params.textDocument.uri);
                if (document) {
                    const context = this.workspaceManager.getContext(params.textDocument.uri);
                    if (context) {
                        const collectionsService = CollectionsService.getInstance();
                        return await doHover(document, params.position, collectionsService);
                    }
                }
            } catch (error) {
                this.handleError(error, 'onHover');
            }
            return null;
        });

        this.connection.onCompletion(async (params) => {
            try {
                const document = this.documents.get(params.textDocument.uri);
                if (document) {
                    const context = this.workspaceManager.getContext(params.textDocument.uri);
                    if (context) {
                        return await doCompletion(document, params.position, context);
                    }
                }
            } catch (error) {
                this.handleError(error, 'onCompletion');
            }
            return null;
        });

        this.connection.onCompletionResolve(async (completionItem) => {
            try {
                const completionData = completionItem.data as { documentUri?: string } | undefined;
                if (completionData?.documentUri) {
                    const context = this.workspaceManager.getContext(completionData.documentUri);
                    if (context) {
                        return await doCompletionResolve(completionItem, context);
                    }
                }
            } catch (error) {
                this.handleError(error, 'onCompletionResolve');
            }
            return completionItem;
        });

        this.connection.onNotification('resync/ansible-inventory', () => {
            void this.workspaceManager.forEachContext((e) => {
                e.clearAnsibleInventory();
                this.connection.window.showInformationMessage(
                    'Re-syncing ansible inventory. This might take some time.',
                );
                void e.ansibleInventory.then(() => {
                    this.connection.window.showInformationMessage('Ansible Inventory re-synced.');
                });
            });
        });

        this.connection.onNotification('update/ansible-metadata', (activeFileUri: string) => {
            void (async () => {
                const ctx = this.workspaceManager.getContext(activeFileUri);
                if (ctx) {
                    const ansibleMetaData = await getAnsibleMetaData(ctx, this.connection);
                    void this.connection.sendNotification('update/ansible-metadata', [
                        ansibleMetaData,
                    ]);
                }
            })();
        });
    }

    /**
     * Logs handler failures to the LSP console with context and stack traces.
     *
     * @param error - Thrown value or error object.
     * @param contextName - Name of the handler where the error occurred.
     */
    private handleError(error: unknown, contextName: string): void {
        const lead = `An error occurred in '${contextName}' handler: `;
        if (error instanceof Error) {
            const stack = error.stack ? `\n${error.stack}` : '';
            this.connection.console.error(`${lead}[${error.name}] ${error.message}${stack}`);
        } else {
            this.connection.console.error(lead + JSON.stringify(error));
        }
    }
}
