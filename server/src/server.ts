import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createConnection,
  DidChangeConfigurationNotification,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  WorkspaceFolder,
} from 'vscode-languageserver/node';
import { AnsibleConfig } from './ansibleConfig';
import { doCompletion } from './completionProvider';
import { IContext } from './context';
import { getDefinition } from './definitionProvider';
import { DocsLibrary } from './docsLibrary';
import { DocumentMetadata } from './documentMeta';
import { doHover } from './hoverProvider';
import { getAnsibleMetadata } from './utils';
import { doValidate } from './validationProvider';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let rootFolder: WorkspaceFolder | undefined;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  if (params.workspaceFolders) {
    rootFolder = params.workspaceFolders[0]; //TODO: support multiroot
  }
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
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
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log('Workspace folder change event received.');
    });
  }
  connection.client;
});

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();
const documentMetadata: Map<string, Thenable<DocumentMetadata>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <ExampleSettings>(
      (change.settings.languageServerExample || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach((doc) => {
    connection.sendDiagnostics({
      uri: doc.uri,
      diagnostics: doValidate(doc),
    });
  });
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'languageServerExample',
    });
    documentSettings.set(resource, result);
  }
  return result;
}

documents.onDidOpen((e) => {
  documentMetadata.set(e.document.uri, getAnsibleMetadata(e.document.uri));
});

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
  documentMetadata.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics: doValidate(change.document),
  });
});

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log('We received a file change event');
});

const ansibleConfig = new AnsibleConfig(connection);
ansibleConfig.initialize(rootFolder?.uri);

const context: IContext = {
  ansibleConfig: ansibleConfig,
  documentMetadata: documentMetadata,
};

const docsLibrary = new DocsLibrary(context, rootFolder);
docsLibrary.initialize().then(() => {
  connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
      return doHover(document, params.position, docsLibrary);
    }
    return null;
  });
  connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
      return doCompletion(document, params.position, docsLibrary);
    }
    return null;
  });
  connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
      return getDefinition(document, params.position, docsLibrary);
    }
    return null;
  });
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
