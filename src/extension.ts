/* "stdlib" */
import * as path from "path";
import {
  commands,
  ExtensionContext,
  extensions,
  StatusBarItem,
  window,
  StatusBarAlignment,
  workspace,
} from "vscode";
import { toggleEncrypt } from "./features/vault";

/* third-party */
import {
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

/* local */
import { AnsiblePlaybookRunProvider } from "./features/runner";
import {
  getConflictingExtensions,
  showUninstallConflictsNotification,
} from "./extensionConflicts";
import { languageAssociation } from "./features/fileAssociation";
import { updateAnsibleInfo } from "./features/ansibleMetaData";

let client: LanguageClient;
let isActiveClient = false;
let cachedAnsibleVersion: string;

// status bar item
let metadataStatusBarItem: StatusBarItem;

export function activate(context: ExtensionContext): void {
  new AnsiblePlaybookRunProvider(context);

  // dynamically associate "ansible" language to the yaml file
  languageAssociation(context);

  context.subscriptions.push(
    commands.registerCommand("extension.ansible.vault", toggleEncrypt)
  );

  context.subscriptions.push(
    commands.registerCommand(
      "extension.resync-ansible-inventory",
      resyncAnsibleInventory
    )
  );

  // create a new status bar item that we can manage
  metadataStatusBarItem = window.createStatusBarItem(
    StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(metadataStatusBarItem);

  metadataStatusBarItem.text = cachedAnsibleVersion;
  metadataStatusBarItem.show();

  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "src", "server.js")
  );

  // server is run at port 6009 for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6010"] };

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
    documentSelector: [{ scheme: "file", language: "ansible" }],
  };

  client = new LanguageClient(
    "ansibleServer",
    "Ansible Server",
    serverOptions,
    clientOptions
  );

  // start the client and the server
  startClient();

  notifyAboutConflicts();

  // Update ansible meta data in the statusbar tooltip (client-server)
  window.onDidChangeActiveTextEditor(updateAnsibleInfoInStatusbar);
  workspace.onDidOpenTextDocument(updateAnsibleInfoInStatusbar);
}

const startClient = async () => {
  try {
    await client.start();
    isActiveClient = true;

    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });

    // Update ansible meta data in the statusbar tooltip (client-server)
    updateAnsibleInfoInStatusbar();
  } catch (error) {
    console.error("Language Client initialization failed");
  }
};

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  isActiveClient = false;
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

/**
 * Sends notification to the server to invalidate ansible inventory service cache
 * And resync the ansible inventory
 */
function resyncAnsibleInventory(): void {
  if (isActiveClient) {
    client.onNotification(
      new NotificationType(`resync/ansible-inventory`),
      (event) => {
        console.log("resync ansible inventory event ->", event);
      }
    );
    client.sendNotification(new NotificationType(`resync/ansible-inventory`));
  }
}

/**
 * Calls the 'updateAnsibleInfo' function to update the ansible metadata
 * in the statusbar hovering action
 */
function updateAnsibleInfoInStatusbar(): void {
  if (window.activeTextEditor?.document.languageId !== "ansible") {
    metadataStatusBarItem.hide();
    return;
  }

  cachedAnsibleVersion = updateAnsibleInfo(
    client,
    metadataStatusBarItem,
    isActiveClient,
    cachedAnsibleVersion
  );
}
