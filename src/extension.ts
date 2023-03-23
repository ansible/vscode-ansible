/* "stdlib" */
import * as vscode from "vscode";
import * as path from "path";
import {
  authentication,
  ExtensionContext,
  extensions,
  window,
  workspace,
} from "vscode";
import { toggleEncrypt } from "./features/vault";
import { AnsibleCommands, WisdomCommands } from "./definitions/constants";
import {
  TelemetryErrorHandler,
  TelemetryOutputChannel,
  TelemetryManager,
} from "./utils/telemetryUtils";

/* third-party */
import {
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn,
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
import { registerCommandWithTelemetry } from "./utils/registerCommands";
import { TreeDataProvider } from "./treeView";
import { WisdomManager } from "./features/wisdom/base";
import {
  WisdomInlineSuggestionProvider,
  inlineSuggestionTriggerHandler,
  inlineSuggestionCommitHandler,
  inlineSuggestionHideHandler,
} from "./features/wisdom/inlineSuggestions";
import { AnsibleContentUploadTrigger } from "./definitions/wisdom";
import { AttributionsWebview } from "./features/wisdom/attributionsWebview";

export let client: LanguageClient;
export let wisdomManager: WisdomManager;
const lsName = "Ansible Support";

export async function activate(context: ExtensionContext): Promise<void> {
  // dynamically associate "ansible" language to the yaml file
  languageAssociation(context);

  // Create Telemetry Service
  const telemetry = new TelemetryManager(context);
  await telemetry.initTelemetryService();

  registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_VAULT,
    toggleEncrypt,
    true
  );
  registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_INVENTORY_RESYNC,
    resyncAnsibleInventory,
    true
  );

  registerCommandWithTelemetry(
    context,
    telemetry,
    WisdomCommands.WISDOM_AUTH_REQUEST,
    getAuthToken,
    true
  );

  // start the client and the server
  await startClient(context, telemetry);

  notifyAboutConflicts();

  // Initialize settings
  const extSettings = new SettingsManager();

  new AnsiblePlaybookRunProvider(context, extSettings.settings, telemetry);

  // handle metadata status bar
  const metaData = new MetadataManager(context, client, telemetry);
  metaData.updateAnsibleInfoInStatusbar();

  // handle wisdom service
  wisdomManager = new WisdomManager(context, client, extSettings, telemetry);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      WisdomCommands.WISDOM_STATUS_BAR_CLICK,
      wisdomManager.wisdomStatusBarClickHandler
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AttributionsWebview.viewType,
      wisdomManager.attributionsProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      WisdomCommands.WISDOM_FETCH_TRAINING_MATCHES,
      () => {
        wisdomManager.attributionsProvider.showAttributions();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      WisdomCommands.WISDOM_CLEAR_TRAINING_MATCHES,
      () => {
        wisdomManager.attributionsProvider.clearAttributions();
      }
    )
  );

  const wisdomSuggestionProvider = new WisdomInlineSuggestionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: "file", language: "ansible" },
      wisdomSuggestionProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      WisdomCommands.WISDOM_SUGGESTION_COMMIT,
      inlineSuggestionCommitHandler
    )
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      WisdomCommands.WISDOM_SUGGESTION_HIDE,
      inlineSuggestionHideHandler
    )
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      WisdomCommands.WISDOM_SUGGESTION_TRIGGER,
      inlineSuggestionTriggerHandler
    )
  );

  // register ansible meta data in the statusbar tooltip (client-server)
  window.onDidChangeActiveTextEditor(
    (editor: vscode.TextEditor | undefined) => {
      updateAnsibleStatusBar(metaData, wisdomManager);
      if (editor) {
        wisdomManager.ansibleContentFeedback(
          editor.document,
          AnsibleContentUploadTrigger.TAB_CHANGE
        );
      }
    }
  );
  workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
    updateAnsibleStatusBar(metaData, wisdomManager);
    wisdomManager.ansibleContentFeedback(
      document,
      AnsibleContentUploadTrigger.FILE_OPEN
    );
  });
  workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
    wisdomManager.ansibleContentFeedback(
      document,
      AnsibleContentUploadTrigger.FILE_CLOSE
    );
  });
  workspace.onDidChangeConfiguration(() =>
    updateConfigurationChanges(metaData, extSettings, wisdomManager)
  );

  const session = await authentication.getSession("auth-wisdom", [], {
    createIfNone: false,
  });

  if (session) {
    window.registerTreeDataProvider(
      "wisdom-explorer-treeview",
      new TreeDataProvider(session)
    );
  }
}

const startClient = async (
  context: ExtensionContext,
  telemetry: TelemetryManager
) => {
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

  const telemetryErrorHandler = new TelemetryErrorHandler(
    telemetry.telemetryService,
    lsName,
    4
  );
  const outputChannel = window.createOutputChannel(lsName);

  const clientOptions: LanguageClientOptions = {
    // register the server for Ansible documents
    documentSelector: [{ scheme: "file", language: "ansible" }],
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    errorHandler: telemetryErrorHandler,
    outputChannel: new TelemetryOutputChannel(
      outputChannel,
      telemetry.telemetryService
    ),
  };

  client = new LanguageClient(
    "ansibleServer",
    "Ansible Server",
    serverOptions,
    clientOptions
  );

  context.subscriptions.push(
    client.onTelemetry((e) => {
      telemetry.telemetryService.send(e);
    })
  );

  try {
    await client.start();

    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });
    telemetry.sendStartupTelemetryEvent(true);
  } catch (err) {
    let errorMessage: string;
    if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }
    console.error(`Language Client initialization failed with ${errorMessage}`);
    telemetry.sendStartupTelemetryEvent(false, errorMessage);
  }
};

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function updateAnsibleStatusBar(
  metaData: MetadataManager,
  wisdomManager: WisdomManager
) {
  metaData.updateAnsibleInfoInStatusbar();
  wisdomManager.updateWisdomStatusbar();
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
async function resyncAnsibleInventory(): Promise<void> {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getAuthToken(): Promise<void> {
  const session = await authentication.getSession("auth-wisdom", [], {
    createIfNone: true,
  });
  window.registerTreeDataProvider(
    "wisdom-explorer-treeview",
    new TreeDataProvider(session)
  );

  if (session) {
    window.showInformationMessage(`Welcome back ${session.account.label}`);
  }
}
