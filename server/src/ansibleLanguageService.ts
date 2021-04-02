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
import { IDocumentMetadata } from './interfaces/documentMeta';
import { ExtensionSettings } from './interfaces/extensionSettings';
import { doCompletion } from './providers/completionProvider';
import { getDefinition } from './providers/definitionProvider';
import { doHover } from './providers/hoverProvider';
import { doValidate } from './providers/validationProvider';
import { getAnsibleMetadata } from './utils/misc';
import { AnsibleConfig } from './services/ansibleConfig';
import { DocsLibrary } from './services/docsLibrary';

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
  constructor(connection: Connection, documents: TextDocuments<TextDocument>) {
    this.connection = connection;
    this.documents = documents;
    this.context = {
      ansibleConfig: new AnsibleConfig(connection),
      documentMetadata: new Map(),
      documentSettings: new Map(),
    };
    this.docsLibrary = new DocsLibrary(this.context);
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
                globPattern: '',
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

    this.documents.onDidOpen((e) => {
      this.context.documentMetadata.set(
        e.document.uri,
        getAnsibleMetadata(e.document.uri)
      );
    });

    // Only keep settings for open documents
    this.documents.onDidClose((e) => {
      this.context.documentSettings.delete(e.document.uri);
      this.context.documentMetadata.delete(e.document.uri);
    });

    this.connection.onDidChangeWatchedFiles((_change) => {
      // Monitored files have change in VSCode
      this.connection.console.log('We received a file change event');
    });
  }

  private registerProviders() {
    this.documents.onDidChangeContent((change) => {
      this.connection.sendDiagnostics({
        uri: change.document.uri,
        diagnostics: doValidate(change.document),
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
