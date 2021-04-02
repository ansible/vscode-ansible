import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
} from 'vscode-languageserver/node';
import { AnsibleLanguageService } from './ansibleLanguageService';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// function getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
//   if (!hasConfigurationCapability) {
//     return Promise.resolve(globalSettings);
//   }
//   let result = documentSettings.get(resource);
//   if (!result) {
//     result = connection.workspace.getConfiguration({
//       scopeUri: resource,
//       section: 'languageServerExample',
//     });
//     documentSettings.set(resource, result);
//   }
//   return result;
// }

const context = new AnsibleLanguageService(connection, documents);
context.initialize();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
