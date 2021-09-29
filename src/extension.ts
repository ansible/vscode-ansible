/* "stdlib" */
import * as path from 'path';
import { ExtensionContext, extensions } from 'vscode';

/* third-party */
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

/* local */
import { AnsiblePlaybookRunProvider } from './features/runner';
import { getConflictingExtensions, showUninstallConflictsNotification } from './extensionConflicts';


let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  new AnsiblePlaybookRunProvider(context);

  const serverModule = context.asAbsolutePath(
    path.join('out', 'server', 'src', 'server.js')
  );

  // server is run at port 6009 for debugging
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const clientOptions: LanguageClientOptions = {
    // register the server for Ansible documents
    documentSelector: [{ scheme: 'file', language: 'ansible' }],
  };

  client = new LanguageClient(
    'ansibleServer',
    'Ansible Server',
    serverOptions,
    clientOptions
  );

  // start the client and the server
  client.start();

  notifyAboutConflicts();
  client.onReady().then(() => {
    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

/**
 * Finds extensions that conflict with our extension.
 * If one or more conflicts are found then show an uninstall notification
 * If no conflicts are found then do nothing
 */
function notifyAboutConflicts(): void {
  const conflictingExtensions = getConflictingExtensions();
  if (conflictingExtensions.length > 0) {
    showUninstallConflictsNotification(conflictingExtensions);
  }
}
