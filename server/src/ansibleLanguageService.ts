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

export class AnsibleLanguageService {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;

  private workspaceManager: WorkspaceManager;
  private hasConfigurationCapability = false;
  private hasWorkspaceFolderCapability = false;
  private hasDiagnosticRelatedInformationCapability = false;

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
      const capabilities = params.capabilities;

      // Does the client support the `workspace/configuration` request?
      // If not, we fall back using global settings.
      this.hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
      );
      this.hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
      );
      this.hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
      );

      const result: InitializeResult = {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          hoverProvider: true,
          // Tell the client that this server supports code completion.
          completionProvider: {
            resolveProvider: false,
          },
          definitionProvider: true,
          workspace: {},
        },
      };
      if (this.hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
          workspaceFolders: {
            supported: true,
          },
        };
      }
      return result;
    });

    this.connection.onInitialized(() => {
      if (this.hasConfigurationCapability) {
        // Register for all configuration changes.
        this.connection.client.register(
          DidChangeConfigurationNotification.type,
          undefined
        );
        this.connection.client.register(
          DidChangeWatchedFilesNotification.type,
          {
            watchers: [
              {
                // watch for documentMetadata
                globPattern: '**/meta/main.{yml,yaml}',
              },
            ],
          }
        );
      }
      if (this.hasWorkspaceFolderCapability) {
        this.connection.workspace.onDidChangeWorkspaceFolders((e) => {
          this.workspaceManager.handleWorkspaceChanged(e);
        });
      }
    });
  }

  private registerLifecycleEventHandlers() {
    this.connection.onDidChangeConfiguration((params) => {
      this.workspaceManager.forEachContext((context) => {
        context.documentSettings.handleConfigurationChanged(params);
      });

      // Revalidate all open text documents
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
      this.workspaceManager.forEachContext((context) => {
        context.documentMetadata.handleWatchedDocumentChange(params);
      });
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
