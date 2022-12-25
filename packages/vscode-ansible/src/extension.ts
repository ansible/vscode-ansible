/* "stdlib" */
import * as path from "path";
import {
  commands,
  ExtensionContext,
  extensions,
  window,
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
import { SettingsManager } from "./settings";
import { AnsiblePlaybookRunProvider } from "./features/runner";
import {
  getConflictingExtensions,
  showUninstallConflictsNotification,
} from "./extensionConflicts";
import { languageAssociation } from "./features/fileAssociation";
import { MetadataManager } from "./features/ansibleMetaData";
import { updateConfigurationChanges } from "./utils/settings";

let client: LanguageClient;

export async function activate(context: ExtensionContext): Promise<void> {
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
  await startClient();

  notifyAboutConflicts();

  // Initialize settings
  const extSettings = new SettingsManager();

  new AnsiblePlaybookRunProvider(context, extSettings.settings);

  // handle metadata status bar
  const metaData = new MetadataManager(context, client);
  metaData.updateAnsibleInfoInStatusbar();

  // register ansible meta data in the statusbar tooltip (client-server)
  window.onDidChangeActiveTextEditor(() =>
    metaData.updateAnsibleInfoInStatusbar()
  );
  workspace.onDidOpenTextDocument(() =>
    metaData.updateAnsibleInfoInStatusbar()
  );
  workspace.onDidChangeConfiguration(() =>
    updateConfigurationChanges(metaData, extSettings)
  );
}

const startClient = async () => {
  try {
    await client.start();

    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });
  } catch (error) {
    console.error("Language Client initialization failed");
  }
};

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

/**
 * Sends notification to the server to invalidate ansible inventory service cache
 * And resync the ansible inventory
 */
function resyncAnsibleInventory(): void {
  if (client.isRunning()) {
    client.onNotification(
      new NotificationType(`resync/ansible-inventory`),
      (event) => {
        console.log("resync ansible inventory event ->", event);
      }
    );
    client.sendNotification(new NotificationType(`resync/ansible-inventory`));
  }
}
