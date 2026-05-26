import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Connection,
  createConnection,
  DidChangeTextDocumentParams,
  NotificationHandler,
  ProposedFeatures,
  TextDocuments,
} from "vscode-languageserver/node";
import { AnsibleLanguageService } from "./ansibleLanguageService";
import { getUnsupportedError } from "./utils/misc";

const connection: Connection = createConnection(ProposedFeatures.all);

const errorMessage = getUnsupportedError();
if (errorMessage) {
  connection.window.showErrorMessage(errorMessage);
}

const docChangeHandlers: NotificationHandler<DidChangeTextDocumentParams>[] =
  [];
connection.onDidChangeTextDocument((params) => {
  for (const handler of docChangeHandlers) {
    handler(params);
  }
});

const connectionProxy = new Proxy(connection, {
  get: (target, p, receiver) => {
    if (p === "onDidChangeTextDocument") {
      return (handler: NotificationHandler<DidChangeTextDocumentParams>) => {
        docChangeHandlers.push(handler);
      };
    }
    return Reflect.get(target, p, receiver) as unknown;
  },
});

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const context = new AnsibleLanguageService(connectionProxy, documents);
context.initialize();

documents.listen(connectionProxy);
connection.listen();
