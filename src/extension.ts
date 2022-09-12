/* eslint-disable  @typescript-eslint/no-explicit-any */
/* "stdlib" */
import * as path from "path";
import {
  commands,
  ExtensionContext,
  extensions,
  StatusBarItem,
  window,
  StatusBarAlignment,
  ThemeColor,
  MarkdownString,
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
import { formatAnsibleMetaData } from "./features/utils/formatAnsibleMetaData";
import { languageAssociation } from "./features/fileAssociation";

let client: LanguageClient;
let cachedAnsibleVersion: string;

// status bar item
let myStatusBarItem: StatusBarItem;

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
  myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  context.subscriptions.push(myStatusBarItem);

  myStatusBarItem.text = cachedAnsibleVersion;
  myStatusBarItem.show();

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
  client.start();

  notifyAboutConflicts();
  client.onReady().then(() => {
    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });
  });

  // Update ansible meta data in the statusbar tooltip (client-server)
  client.onReady().then(updateAnsibleInfo);
  window.onDidChangeActiveTextEditor(updateAnsibleInfo);
  workspace.onDidOpenTextDocument(updateAnsibleInfo);
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

/**
 * Sends notification to the server to invalidate ansible inventory service cache
 * And resync the ansible inventory
 */
function resyncAnsibleInventory(): void {
  client.onReady().then(() => {
    client.onNotification(
      new NotificationType(`resync/ansible-inventory`),
      (event) => {
        console.log("resync ansible inventory event ->", event);
      }
    );
    client.sendNotification(new NotificationType(`resync/ansible-inventory`));
  });
}

/**
 * Sends notification with active file uri as param to the server
 * and receives notification from the server with ansible meta data associated with the opened file as param
 */
function updateAnsibleInfo(): void {
  if (window.activeTextEditor?.document.languageId !== "ansible") {
    myStatusBarItem.hide();
    return;
  }

  client.onReady().then(() => {
    myStatusBarItem.tooltip = new MarkdownString(
      ` $(sync~spin) Fetching... `,
      true
    );
    myStatusBarItem.show();
    client.onNotification(
      new NotificationType(`update/ansible-metadata`),
      (ansibleMetaDataList: any) => {
        const ansibleMetaData = formatAnsibleMetaData(ansibleMetaDataList[0]);
        if (ansibleMetaData.ansiblePresent) {
          console.log("ansible found");
          cachedAnsibleVersion =
            ansibleMetaData.metaData["ansible information"]["ansible version"];
          const tooltip = ansibleMetaData.markdown;
          myStatusBarItem.text = ansibleMetaData.eeEnabled
            ? `$(pass-filled) [EE] ${cachedAnsibleVersion}`
            : `$(pass-filled) ${cachedAnsibleVersion}`;
          myStatusBarItem.backgroundColor = "";
          myStatusBarItem.tooltip = tooltip;

          if (!ansibleMetaData.ansibleLintPresent) {
            myStatusBarItem.text = `$(warning) ${cachedAnsibleVersion}`;
            myStatusBarItem.backgroundColor = new ThemeColor(
              "statusBarItem.warningBackground"
            );
          }

          myStatusBarItem.show();
        } else {
          console.log("ansible not found");
          myStatusBarItem.text = "$(error) Ansible Info";
          myStatusBarItem.tooltip = ansibleMetaData.markdown;
          myStatusBarItem.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
          );
          myStatusBarItem.show();
        }
      }
    );
    const activeFileUri = window.activeTextEditor?.document.uri.toString();
    client.sendNotification(new NotificationType(`update/ansible-metadata`), [
      activeFileUri,
    ]);
  });
}
