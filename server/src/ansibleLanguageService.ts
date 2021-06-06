import {
  Connection,
  Diagnostic,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  InitializeParams,
  InitializeResult,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  doCompletion,
  doCompletionResolve,
} from './providers/completionProvider';
import { getDefinition } from './providers/definitionProvider';
import { doHover } from './providers/hoverProvider';
import {
  doSemanticTokens,
  tokenModifiers,
  tokenTypes,
} from './providers/semanticTokenProvider';
import { doValidate } from './providers/validationProvider';
import { WorkspaceManager } from './services/workspaceManager';

/**
 * Initializes the connection and registers all lifecycle event handlers.
 *
 * The event handlers interact with the `WorkspaceManager` to find the relevant
 * context and service instance, and then perform the required actions.
 *
 * Providers are used here directly in the event handlers.
 */
export class AnsibleLanguageService {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;

  private workspaceManager: WorkspaceManager;

  constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
    this.workspaceManager = new WorkspaceManager(connection);
  }

  public initialize(): void {
    this.initializeConnection();
    this.registerLifecycleEventHandlers();
  }

  private initializeConnection() {
    this.connection.onInitialize((params: InitializeParams) => {
      this.workspaceManager.setWorkspaceFolders(params.workspaceFolders || []);
      this.workspaceManager.setCapabilities(params.capabilities);

      const result: InitializeResult = {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          semanticTokensProvider: {
            documentSelector: [
              {
                language: 'ansible',
              },
            ],
            full: true,
            legend: {
              tokenTypes: tokenTypes,
              tokenModifiers: tokenModifiers,
            },
          },
          hoverProvider: true,
          completionProvider: {
            resolveProvider: true,
          },
          definitionProvider: true,
          workspace: {},
        },
      };
      if (
        this.workspaceManager.clientCapabilities.workspace?.workspaceFolders
      ) {
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
        // register for all configuration changes
        this.connection.client.register(
          DidChangeConfigurationNotification.type,
          {
            section: 'ansible',
          }
        );
      }
      if (
        this.workspaceManager.clientCapabilities.workspace?.workspaceFolders
      ) {
        this.connection.workspace.onDidChangeWorkspaceFolders((e) => {
          this.workspaceManager.handleWorkspaceChanged(e);
        });
      }
      this.connection.client.register(DidChangeWatchedFilesNotification.type, {
        watchers: [
          {
            // watch ansible configuration
            globPattern: '**/ansible.cfg',
          },
          {
            // watch ansible-lint configuration
            globPattern: '**/.ansible-lint',
          },
          {
            // watch role meta-configuration
            globPattern: '**/meta/main.{yml,yaml}',
          },
        ],
      });
    });
  }

  private registerLifecycleEventHandlers() {
    this.connection.onDidChangeConfiguration(async (params) => {
      try {
        await this.workspaceManager.forEachContext((context) =>
          context.documentSettings.handleConfigurationChanged(params)
        );

        // revalidate all open text documents
        this.documents.all().forEach(async (doc) => {
          this.sendDiagnostics(await doValidate(doc));
        });
      } catch (error) {
        this.handleError(error, 'onDidChangeConfiguration');
      }
    });

    this.documents.onDidOpen(async (e) => {
      try {
        const context = this.workspaceManager.getContext(e.document.uri);
        if (context) {
          this.sendDiagnostics(
            await doValidate(e.document, {
              linter: context.ansibleLint,
              quick: false,
              onOpen: true,
            })
          );
        }
      } catch (error) {
        this.handleError(error, 'onDidOpen');
      }
    });

    this.documents.onDidClose((e) => {
      try {
        const context = this.workspaceManager.getContext(e.document.uri);
        if (context) {
          context.documentSettings.handleDocumentClosed(e.document.uri);
          context.ansibleLint.handleDocumentClosed(e.document.uri);
        }
      } catch (error) {
        this.handleError(error, 'onDidClose');
      }
    });

    this.connection.onDidChangeWatchedFiles((params) => {
      try {
        this.workspaceManager.forEachContext((context) =>
          context.handleWatchedDocumentChange(params)
        );
      } catch (error) {
        this.handleError(error, 'onDidChangeWatchedFiles');
      }
    });

    this.documents.onDidSave(async (e) => {
      try {
        const context = this.workspaceManager.getContext(e.document.uri);
        if (context) {
          this.sendDiagnostics(
            await doValidate(e.document, {
              linter: context.ansibleLint,
              quick: false,
              onOpen: false,
            })
          );
        }
      } catch (error) {
        this.handleError(error, 'onDidSave');
      }
    });

    this.connection.onDidChangeTextDocument((e) => {
      try {
        const context = this.workspaceManager.getContext(e.textDocument.uri);
        if (context) {
          context.ansibleLint.reconcileCacheItems(
            e.textDocument.uri,
            e.contentChanges
          );
        }
      } catch (error) {
        this.handleError(error, 'onDidChangeTextDocument');
      }
    });

    this.documents.onDidChangeContent(async (e) => {
      try {
        const context = this.workspaceManager.getContext(e.document.uri);
        // depending on whether we have the context, we either validate with
        // Ansible-lint or perform simple YAML validation
        const diagnostics = await (context
          ? doValidate(e.document, {
              linter: context.ansibleLint,
              quick: true,
              onOpen: false,
            })
          : doValidate(e.document));

        this.sendDiagnostics(diagnostics);
      } catch (error) {
        this.handleError(error, 'onDidChangeContent');
      }
    });

    this.connection.languages.semanticTokens.on(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri
          );
          if (context) {
            return await doSemanticTokens(document, await context.docsLibrary);
          }
        }
      } catch (error) {
        this.handleError(error, 'onSemanticTokens');
      }
      return {
        data: [],
      };
    });

    this.connection.onHover(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri
          );
          if (context) {
            return await doHover(
              document,
              params.position,
              await context.docsLibrary
            );
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
          const context = this.workspaceManager.getContext(
            params.textDocument.uri
          );
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
        if (completionItem.data?.documentUri) {
          const context = this.workspaceManager.getContext(
            completionItem.data?.documentUri
          );
          if (context) {
            return await doCompletionResolve(completionItem, context);
          }
        }
      } catch (error) {
        this.handleError(error, 'onCompletionResolve');
      }
      return completionItem;
    });

    this.connection.onDefinition(async (params) => {
      try {
        const document = this.documents.get(params.textDocument.uri);
        if (document) {
          const context = this.workspaceManager.getContext(
            params.textDocument.uri
          );
          if (context) {
            return await getDefinition(
              document,
              params.position,
              await context.docsLibrary
            );
          }
        }
      } catch (error) {
        this.handleError(error, 'onDefinition');
      }
      return null;
    });
  }

  private handleError(error: unknown, contextName: string) {
    const leadMessage = `An error occurred in '${contextName}' handler: `;
    if (error instanceof Error) {
      const stack = error.stack ? `\n${error.stack}` : '';
      this.connection.console.error(
        `${leadMessage}[${error.name}] ${error.message}${stack}`
      );
    } else {
      this.connection.console.error(leadMessage + JSON.stringify(error));
    }
  }

  private sendDiagnostics(diagnostics: Map<string, Diagnostic[]>) {
    for (const [fileUri, fileDiagnostics] of diagnostics) {
      this.connection.sendDiagnostics({
        uri: fileUri,
        diagnostics: fileDiagnostics,
      });
    }
  }
}
