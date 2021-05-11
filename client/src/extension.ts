import * as path from 'path';
import {
  ExtensionContext,
  languages,
  OutputChannel,
  TextDocument,
  window as Window,
  workspace as Workspace,
  WorkspaceFolder,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { DocumentSemanticTokensProvider, legend } from './semanticTokens';
import { WorkspaceManager } from './workspaceManager';

let defaultClient: LanguageClient;
const clients: Map<string, LanguageClient> = new Map();

function getLanguageClient(
  serverModule: string,
  outputChannel: OutputChannel,
  debugPort: number,
  folder?: WorkspaceFolder
): LanguageClient {
  const debugOptions = { execArgv: ['--nolazy', `--inspect=${debugPort}`] };
  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };
  const clientOptions: LanguageClientOptions = folder
    ? {
        documentSelector: [
          {
            scheme: 'file',
            language: 'ansible',
            pattern: `${folder.uri.fsPath}/**/*`,
          },
        ],
        workspaceFolder: folder,
        synchronize: {
          // Notify the server about file changes to ansible.cfg files contained in the root folder
          fileEvents: Workspace.createFileSystemWatcher(
            `${folder.uri.fsPath}/**/ansible.cfg`
          ),
        },
      }
    : {
        documentSelector: [{ scheme: 'untitled', language: 'ansible' }],
        synchronize: {
          // Notify the server about file changes to the top ansible.cfg file of the workspace
          fileEvents: Workspace.createFileSystemWatcher('ansible.cfg'),
        },
      };
  clientOptions.diagnosticCollectionName = 'ansible-lang';
  clientOptions.outputChannel = outputChannel;
  return new LanguageClient(
    'ansibleServer',
    'Ansible Server',
    serverOptions,
    clientOptions
  );
}

export function activate(context: ExtensionContext): void {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'server.js')
  );
  const outputChannel: OutputChannel = Window.createOutputChannel(
    'Ansible-Language-Server'
  );

  const workspaceManager = new WorkspaceManager();

  function textDocumentOpenedHandler(document: TextDocument): void {
    if (
      // Check if we're dealing with a regular 'ansible' file
      document.languageId === 'ansible' &&
      (document.uri.scheme === 'file' || document.uri.scheme === 'untitled')
    ) {
      const uri = document.uri;
      // Untitled files go to a default client.
      if (uri.scheme === 'untitled' && !defaultClient) {
        defaultClient = getLanguageClient(serverModule, outputChannel, 6009);
        defaultClient.start();
        return;
      }
      let folder = Workspace.getWorkspaceFolder(uri);
      // Files outside a folder should be handled by the default client as well.
      if (!folder && !defaultClient) {
        defaultClient = getLanguageClient(serverModule, outputChannel, 6009);
        defaultClient.start();
        return;
      }
      if (folder) {
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        folder = workspaceManager.getOuterMostWorkspaceFolder(folder);

        if (!clients.has(folder.uri.toString())) {
          const client = getLanguageClient(
            serverModule,
            outputChannel,
            6010 + clients.size,
            folder
          );
          client.start();
          clients.set(folder.uri.toString(), client);
        }
      }
    }
  }

  Workspace.onDidOpenTextDocument(textDocumentOpenedHandler);
  Workspace.textDocuments.forEach(textDocumentOpenedHandler);
  Workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const client = clients.get(folder.uri.toString());
      if (client) {
        clients.delete(folder.uri.toString());
        client.stop();
      }
    }
  });

  context.subscriptions.push(
    languages.registerDocumentSemanticTokensProvider(
      { language: 'ansible' },
      new DocumentSemanticTokensProvider(),
      legend
    )
  );
}

export function deactivate(): Thenable<void> | undefined {
  const promises: Thenable<void>[] = [];
  if (defaultClient) {
    promises.push(defaultClient.stop());
  }
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}
