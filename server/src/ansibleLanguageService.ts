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
import { doCompletion } from './providers/completionProvider';
import { getDefinition } from './providers/definitionProvider';
import { doHover } from './providers/hoverProvider';
import { doValidate } from './providers/validationProvider';
import {
  WorkspaceFolderContext,
  WorkspaceManager,
} from './services/workspaceManager';

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
                // TODO: Narrow down this watcher once LSP support for multi-root gets better
                globPattern: '**/meta/main.{yml,yaml}',
              },
            ],
          }
        );
      }
      if (this.hasWorkspaceFolderCapability) {
        this.connection.workspace.onDidChangeWorkspaceFolders((event) => {
          this.workspaceManager.handleWorkspaceChanged(event);
        });
      }
    });
  }

  private registerLifecycleEventHandlers() {
    this.connection.onDidChangeConfiguration((change) => {
      this.workspaceManager.forEachContext((context) => {
        context.documentSettings.handleConfigurationChanged(change);
      });

      // Revalidate all open text documents
      this.documents.all().forEach((doc) => {
        this.connection.sendDiagnostics({
          uri: doc.uri,
          diagnostics: doValidate(doc),
        });
      });
    });

    this.documents.onDidOpen(async (e) => {
      const context = this.workspaceManager.getContext(e.document.uri);
      if (context) {
        await this.doFullValidation(context, e.document);
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

    this.connection.onDidChangeWatchedFiles((change) => {
      this.workspaceManager.forEachContext((context) => {
        context.documentMetadata.handleWatchedDocumentChange(change);
      });
    });

    this.documents.onDidSave(async (change) => {
      const context = this.workspaceManager.getContext(change.document.uri);
      if (context) {
        await this.doFullValidation(context, change.document);
      }
    });

    this.connection.onDidChangeTextDocument((change) => {
      const context = this.workspaceManager.getContext(change.textDocument.uri);
      if (context) {
        context.ansibleLint.invalidateCacheItems(
          change.textDocument.uri,
          change.contentChanges
        );
      }
    });

    this.documents.onDidChangeContent((change) => {
      const diagnostics = doValidate(change.document);

      const context = this.workspaceManager.getContext(change.document.uri);
      if (context) {
        const lintDiagnostics = context.ansibleLint.getValidationFromCache(
          change.document.uri
        );
        if (lintDiagnostics) {
          diagnostics.push(...lintDiagnostics);
        }
      }
      this.connection.sendDiagnostics({
        uri: change.document.uri,
        diagnostics: diagnostics,
      });
    });

    this.connection.onHover((params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri
        );
        if (context) {
          return doHover(document, params.position, context.docsLibrary);
        }
      }
      return null;
    });

    this.connection.onCompletion((params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri
        );
        if (context) {
          return doCompletion(document, params.position, context.docsLibrary);
        }
      }
      return null;
    });

    this.connection.onDefinition((params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        const context = this.workspaceManager.getContext(
          params.textDocument.uri
        );
        if (context) {
          return getDefinition(document, params.position, context.docsLibrary);
        }
      }
      return null;
    });
  }

  private async doFullValidation(
    context: WorkspaceFolderContext,
    document: TextDocument
  ) {
    const diagnostics = await context.ansibleLint.doValidate(document);
    for (const [fileUri, fileDiagnostics] of diagnostics) {
      if (document.uri === fileUri) {
        // ensure that regular diagnostics are still present
        fileDiagnostics.push(...doValidate(document));
      }
      this.connection.sendDiagnostics({
        uri: fileUri,
        diagnostics: fileDiagnostics,
      });
    }
  }
}
