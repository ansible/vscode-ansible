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
import { AnsibleCommands } from "./definitions/constants";
import { LightSpeedCommands, UserAction } from "./definitions/lightspeed";
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
import { LightSpeedManager } from "./features/lightspeed/base";
import {
  LightSpeedInlineSuggestionProvider,
  inlineSuggestionTriggerHandler,
  inlineSuggestionCommitHandler,
  inlineSuggestionHideHandler,
  suggestionDisplayed,
} from "./features/lightspeed/inlineSuggestions";
import { AnsibleContentUploadTrigger } from "./definitions/lightspeed";
import { ContentMatchesWebview } from "./features/lightspeed/contentMatchesWebview";
import { ANSIBLE_LIGHTSPEED_AUTH_ID } from "./features/lightspeed/utils/webUtils";
import {
  setPythonInterpreter,
  setPythonInterpreterWithCommand,
} from "./features/utils/setPythonInterpreter";
import { PythonInterpreterManager } from "./features/pythonMetadata";
import { AnsibleToxController } from "./features/ansibleTox/controller";
import { AnsibleToxProvider } from "./features/ansibleTox/provider";
import { findProjectDir } from "./features/ansibleTox/utils";
import { LightspeedFeedbackWebviewViewProvider } from "./features/lightspeed/feedbackWebviewViewProvider";
import { LightspeedFeedbackWebviewProvider } from "./features/lightspeed/feedbackWebviewProvider";
import { AnsibleCreatorMenu } from "./features/contentCreator/welcomePage";
import { AnsibleCreatorInit } from "./features/contentCreator/initPage";
import { withInterpreter } from "./features/utils/commandRunner";
import { IFileSystemWatchers } from "./interfaces/watchers";
import { LightspeedAuthSession } from "./interfaces/lightspeed";

export let client: LanguageClient;
export let lightSpeedManager: LightSpeedManager;
export const globalFileSystemWatcher: IFileSystemWatchers = {};

const lsName = "Ansible Support";

export async function activate(context: ExtensionContext): Promise<void> {
  // dynamically associate "ansible" language to the yaml file
  await languageAssociation(context);

  // set correct python interpreter
  const workspaceFolders = workspace.workspaceFolders;
  if (workspaceFolders) {
    await setPythonInterpreter();
  }

  // Create Telemetry Service
  const telemetry = new TelemetryManager(context);
  await telemetry.initTelemetryService();

  await registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_VAULT,
    toggleEncrypt,
    true
  );
  await registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_INVENTORY_RESYNC,
    resyncAnsibleInventory,
    true
  );

  await registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER,
    setPythonInterpreterWithCommand,
    true
  );

  await registerCommandWithTelemetry(
    context,
    telemetry,
    LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
    getAuthToken,
    true
  );

  // start the client and the server
  await startClient(context, telemetry);

  notifyAboutConflicts();

  // Initialize settings
  const extSettings = new SettingsManager();
  await extSettings.initialize();

  new AnsiblePlaybookRunProvider(context, extSettings.settings, telemetry);

  // handle metadata status bar
  const metaData = new MetadataManager(context, client, telemetry, extSettings);
  await metaData.updateAnsibleInfoInStatusbar();

  // handle python status bar
  const pythonInterpreterManager = new PythonInterpreterManager(
    context,
    client,
    telemetry,
    extSettings
  );
  await pythonInterpreterManager.updatePythonInfoInStatusbar();

  /**
   * Handle "Ansible Lightspeed" in the extension
   */
  lightSpeedManager = new LightSpeedManager(
    context,
    client,
    extSettings,
    telemetry
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_STATUS_BAR_CLICK,
      () =>
        lightSpeedManager.statusBarProvider.lightSpeedStatusBarClickHandler()
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ContentMatchesWebview.viewType,
      lightSpeedManager.contentMatchesProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES,
      () => {
        lightSpeedManager.contentMatchesProvider.showContentMatches();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_CLEAR_TRAINING_MATCHES,
      () => {
        lightSpeedManager.contentMatchesProvider.clearContentMatches();
      }
    )
  );

  const lightSpeedSuggestionProvider = new LightSpeedInlineSuggestionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: "file", language: "ansible" },
      lightSpeedSuggestionProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT,
      inlineSuggestionCommitHandler
    )
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE,
      async (
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit,
        userAction?: UserAction
      ) => {
        await inlineSuggestionHideHandler(userAction);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER,
      inlineSuggestionTriggerHandler
    )
  );

  // Listen for text selection changes
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      const lightSpeedSettings =
        lightSpeedManager.settingsManager.settings.lightSpeedService;
      if (
        suggestionDisplayed.get() &&
        lightSpeedSettings.enabled &&
        lightSpeedSettings.suggestions.enabled
      ) {
        suggestionDisplayed.reset();
      }
    })
  );

  // register ansible meta data in the statusbar tooltip (client-server)
  window.onDidChangeActiveTextEditor(
    async (editor: vscode.TextEditor | undefined) => {
      await updateAnsibleStatusBar(
        metaData,
        lightSpeedManager,
        pythonInterpreterManager
      );
      if (editor) {
        await lightSpeedManager.ansibleContentFeedback(
          editor.document,
          AnsibleContentUploadTrigger.TAB_CHANGE
        );
      }
    }
  );
  workspace.onDidOpenTextDocument(async (document: vscode.TextDocument) => {
    await updateAnsibleStatusBar(
      metaData,
      lightSpeedManager,
      pythonInterpreterManager
    );
    lightSpeedManager.ansibleContentFeedback(
      document,
      AnsibleContentUploadTrigger.FILE_OPEN
    );
  });
  workspace.onDidCloseTextDocument(async (document: vscode.TextDocument) => {
    await lightSpeedManager.ansibleContentFeedback(
      document,
      AnsibleContentUploadTrigger.FILE_CLOSE
    );
  });

  workspace.onDidChangeConfiguration(async () => {
    await updateConfigurationChanges(
      metaData,
      pythonInterpreterManager,
      extSettings,
      lightSpeedManager
    );
    await updateAnsibleStatusBar(
      metaData,
      lightSpeedManager,
      pythonInterpreterManager
    );
  });

  let session: vscode.AuthenticationSession | undefined;

  if (await workspace.getConfiguration("ansible").get("lightspeed.enabled")) {
    session = await authentication.getSession(ANSIBLE_LIGHTSPEED_AUTH_ID, [], {
      createIfNone: false,
    });
  }

  if (session) {
    window.registerTreeDataProvider(
      "lightspeed-explorer-treeview",
      new TreeDataProvider(<LightspeedAuthSession>session)
    );
  }

  // handle lightSpeed feedback
  const lightspeedFeedbackProvider = new LightspeedFeedbackWebviewViewProvider(
    context.extensionUri
  );

  // Register the Lightspeed provider for a Webview View
  const lightspeedFeedbackDisposable = window.registerWebviewViewProvider(
    LightspeedFeedbackWebviewViewProvider.viewType,
    lightspeedFeedbackProvider
  );

  context.subscriptions.push(lightspeedFeedbackDisposable);

  // Register the Lightspeed provider for a Webview
  const lightspeedFeedbackCommand = vscode.commands.registerCommand(
    LightSpeedCommands.LIGHTSPEED_FEEDBACK,
    () => {
      LightspeedFeedbackWebviewProvider.render(context.extensionUri);
    }
  );

  context.subscriptions.push(lightspeedFeedbackCommand);

  /**
   * Handle "Ansible Tox" in the extension
   */
  const ansibleToxController = new AnsibleToxController();
  context.subscriptions.push(await ansibleToxController.create());

  const workspaceTox = findProjectDir();

  if (workspaceTox) {
    const testProvider = new AnsibleToxProvider(workspaceTox);
    context.subscriptions.push(
      vscode.tasks.registerTaskProvider(
        AnsibleToxProvider.toxType,
        testProvider
      )
    );
  }

  /**
   * Handle "Ansible Creator" in the extension
   */

  // pip install ansible-creator
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.content-creator.install",
      async () => {
        const extSettings = new SettingsManager();
        await extSettings.initialize();

        const pythonInterpreter = extSettings.settings.interpreterPath;

        // specify the current python interpreter path in the pip installation
        const [command, runEnv] = withInterpreter(
          extSettings.settings,
          `${pythonInterpreter} -m pip install ansible-creator`,
          "--no-input"
        );

        let terminal;
        if (
          vscode.workspace.getConfiguration("ansible.ansible").reuseTerminal
        ) {
          terminal = vscode.window.terminals.find(
            (terminal) => terminal.name === "Ansible Terminal"
          ) as vscode.Terminal;
        }
        terminal = vscode.window.createTerminal({
          name: "Ansible Terminal",
          env: runEnv,
        });
        terminal.show();
        terminal.sendText(command);
      }
    )
  );

  // open ansible-python workspace settings directly
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.python-settings.open",
      async () => {
        await vscode.commands.executeCommand(
          "workbench.action.openWorkspaceSettings",
          "ansible.python"
        );
      }
    )
  );

  // open ansible-creator menu
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.menu", () => {
      AnsibleCreatorMenu.render(context.extensionUri);
    })
  );

  // open ansible-creator init
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.init", () => {
      AnsibleCreatorInit.render(context.extensionUri);
    })
  );

  // open ansible-creator create
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.create", () => {
      window.showInformationMessage("This feature is coming soon. Stay tuned.");
    })
  );

  // open ansible-creator sample
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.sample", () => {
      window.showInformationMessage("This feature is coming soon. Stay tuned.");
    })
  );
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

async function updateAnsibleStatusBar(
  metaData: MetadataManager,
  lightSpeedManager: LightSpeedManager,
  pythonInterpreterManager: PythonInterpreterManager
) {
  await metaData.updateAnsibleInfoInStatusbar();
  await lightSpeedManager.statusBarProvider.updateLightSpeedStatusbar();
  await pythonInterpreterManager.updatePythonInfoInStatusbar();
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
  if (
    !(await workspace.getConfiguration("ansible").get("lightspeed.enabled"))
  ) {
    await window.showErrorMessage(
      "Enable lightspeed services from settings to use the feature."
    );
    return;
  }
  lightSpeedManager.currentModelValue = undefined;
  const session = await authentication.getSession(
    ANSIBLE_LIGHTSPEED_AUTH_ID,
    [],
    {
      createIfNone: true,
    }
  );
  window.registerTreeDataProvider(
    "lightspeed-explorer-treeview",
    new TreeDataProvider(<LightspeedAuthSession>session)
  );

  if (session) {
    window.showInformationMessage(`Welcome back ${session.account.label}`);
  }
}
