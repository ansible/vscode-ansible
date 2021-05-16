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
import { doCompletion } from './providers/completionProvider';
import { getDefinition } from './providers/definitionProvider';
import { doHover } from './providers/hoverProvider';
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
          hoverProvider: true,
          completionProvider: {
            resolveProvider: false,
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
            // watch for documentMetadata
            globPattern: '**/meta/main.{yml,yaml}',
          },
        ],
      });
    });
  }

  private registerLifecycleEventHandlers() {
    this.connection.onDidChangeConfiguration(async (params) => {
      await this.workspaceManager.forEachContext((context) =>
        context.documentSettings.handleConfigurationChanged(params)
      );

      // revalidate all open text documents
      this.documents.all().forEach(async (doc) => {
        this.sendDiagnostics(await doValidate(doc));
      });
    });

    this.documents.onDidOpen(async (e) => {
      const context = this.workspaceManager.getContext(e.document.uri);
      if (context) {
        this.sendDiagnostics(await doValidate(e.document, context.ansibleLint));
      }
    });

    this.documents.onDidClose((e) => {
      const context = this.workspaceManager.getContext(e.document.uri);
      if (context) {
        context.documentSettings.handleDocumentClosed(e.document.uri);
      }

      // need to clear the diagnostics, otherwise they remain after changing language
      this.connection.sendDiagnostics({
        uri: e.document.uri,
        diagnostics: [],
      });
    });

    this.connection.onDidChangeWatchedFiles((params) => {
      this.workspaceManager.forEachContext((context) =>
        context.documentMetadata.handleWatchedDocumentChange(params)
      );
    });

    this.documents.onDidSave(async (e) => {
      const context = this.workspaceManager.getContext(e.document.uri);
      if (context) {
        this.sendDiagnostics(await doValidate(e.document, context.ansibleLint));
      }
    });

    this.connection.onDidChangeTextDocument((e) => {
      const context = this.workspaceManager.getContext(e.textDocument.uri);
      if (context) {
        context.ansibleLint.invalidateCacheItems(
          e.textDocument.uri,
          e.contentChanges
        );
      }
    });

    this.documents.onDidChangeContent(async (e) => {
      const context = this.workspaceManager.getContext(e.document.uri);
      const diagnostics = await (context
        ? doValidate(e.document, context.ansibleLint, true)
        : doValidate(e.document));

      this.sendDiagnostics(diagnostics);
    });

    this.connection.onHover(async (params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri
        );
        if (context) {
          return doHover(document, params.position, await context.docsLibrary);
        }
      }
      return null;
    });

    this.connection.onCompletion(async (params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri
        );
        if (context) {
          return doCompletion(
            document,
            params.position,
            await context.docsLibrary
          );
        }
      }
      return null;
    });

    this.connection.onDefinition(async (params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri
        );
        if (context) {
          return getDefinition(
            document,
            params.position,
            await context.docsLibrary
          );
        }
      }
      return null;
    });
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
