import {
  Connection,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  InitializeParams,
  InitializeResult,
  TextDocuments,
  TextDocumentSyncKind,
  WorkspaceFolder,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IContext } from './interfaces/context';
import { ExtensionSettings } from './interfaces/extensionSettings';
import { doCompletion } from './providers/completionProvider';
import { getDefinition } from './providers/definitionProvider';
import { doHover } from './providers/hoverProvider';
import { doValidate } from './providers/validationProvider';
import { AnsibleConfig } from './services/ansibleConfig';
import { AnsibleLint } from './services/ansibleLint';
import { DocsLibrary } from './services/docsLibrary';
import { MetadataLibrary } from './services/metadataLibrary';

export class AnsibleLanguageService {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;

  private rootFolder: WorkspaceFolder | undefined;
  private hasConfigurationCapability = false;
  private hasWorkspaceFolderCapability = false;
  private hasDiagnosticRelatedInformationCapability = false;

  private defaultSettings: ExtensionSettings = { maxNumberOfProblems: 1000 };
  private globalSettings: ExtensionSettings = this.defaultSettings;

  private docsLibrary: DocsLibrary;
  private context: IContext;
  private metadataLibrary: MetadataLibrary;
  private ansibleLint: AnsibleLint;

  constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
    this.context = {
      ansibleConfig: new AnsibleConfig(connection),
      documentMetadata: new Map(),
      documentSettings: new Map(),
    };
    this.docsLibrary = new DocsLibrary(this.context);
    this.metadataLibrary = new MetadataLibrary(this.context);
    this.ansibleLint = new AnsibleLint(connection);
  }

  public initialize(): void {
    this.initializeConnection();
    this.registerLifecycleEventHandlers();
    this.context.ansibleConfig.initialize();
    this.docsLibrary.initialize();
    this.registerProviders();
  }

  private initializeConnection() {
    this.connection.onInitialize((params: InitializeParams) => {
      if (params.workspaceFolders) {
        this.rootFolder = params.workspaceFolders[0]; //TODO: support multiroot
      }
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
        this.connection.workspace.onDidChangeWorkspaceFolders((_event) => {
          this.connection.console.log(
            'Workspace folder change event received.'
          );
        });
      }
      this.connection.client;
    });
  }

  private registerLifecycleEventHandlers() {
    this.connection.onDidChangeConfiguration((change) => {
      if (this.hasConfigurationCapability) {
        // Reset all cached document settings
        this.context.documentSettings.clear();
      } else {
        this.globalSettings = <ExtensionSettings>(
          (change.settings.languageServerExample || this.defaultSettings)
        );
      }

      // Revalidate all open text documents
      this.documents.all().forEach((doc) => {
        this.connection.sendDiagnostics({
          uri: doc.uri,
          diagnostics: doValidate(doc),
        });
      });
    });

    this.documents.onDidOpen(async (e) => {
      this.metadataLibrary.handleDocumentOpened(e.document.uri);
    });

    this.documents.onDidClose((e) => {
      this.context.documentSettings.delete(e.document.uri);
      this.metadataLibrary.handleDocumentClosed(e.document.uri);

      // need to clear the diagnostics, otherwise they remain after changing language
      this.connection.sendDiagnostics({
        uri: e.document.uri,
        diagnostics: [],
      });
    });

    this.connection.onDidChangeWatchedFiles((_change) => {
      this.metadataLibrary.handleWatchedDocumentChange(_change);
    });
  }

  private registerProviders() {
    this.documents.onDidSave(async (change) => {
      const diagnostics = await this.ansibleLint.doValidate(change.document);
      diagnostics.forEach((fileDiagnostics, fileUri) => {
        if (change.document.uri === fileUri) {
          // ensure that regular diagnostics are still present
          fileDiagnostics.push(...doValidate(change.document));
        }
        this.connection.sendDiagnostics({
          uri: fileUri,
          diagnostics: fileDiagnostics,
        });
      });
    });
    this.connection.onDidChangeTextDocument((change) => {
      this.ansibleLint.invalidateCacheItems(
        change.textDocument.uri,
        change.contentChanges
      );
    });
    this.documents.onDidChangeContent((change) => {
      const diagnostics = doValidate(change.document);
      const lintDiagnostics = this.ansibleLint.getValidationFromCache(
        change.document.uri
      );
      if (lintDiagnostics) {
        diagnostics.push(...lintDiagnostics);
      }
      this.connection.sendDiagnostics({
        uri: change.document.uri,
        diagnostics: diagnostics,
      });
    });
    this.connection.onHover((params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        return doHover(document, params.position, this.docsLibrary);
      }
      return null;
    });
    this.connection.onCompletion((params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        return doCompletion(document, params.position, this.docsLibrary);
      }
      return null;
    });
    this.connection.onDefinition((params) => {
      const document = this.documents.get(params.textDocument.uri);
      if (document) {
        return getDefinition(document, params.position, this.docsLibrary);
      }
      return null;
    });
  }
}
