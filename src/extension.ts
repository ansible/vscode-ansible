/* "stdlib" */
import * as vscode from "vscode";
import * as path from "path";
import { ExtensionContext, extensions, window, workspace } from "vscode";
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
import { LightSpeedManager } from "./features/lightspeed/base";
import {
  ignorePendingSuggestion,
  inlineSuggestionCommitHandler,
  inlineSuggestionReplaceMarker,
  inlineSuggestionHideHandler,
  inlineSuggestionTextDocumentChangeHandler,
  inlineSuggestionTriggerHandler,
  LightSpeedInlineSuggestionProvider,
  rejectPendingSuggestion,
} from "./features/lightspeed/inlineSuggestions";
import { playbookExplanation } from "./features/lightspeed/playbookExplanation";
import { AnsibleContentUploadTrigger } from "./definitions/lightspeed";
import { ContentMatchesWebview } from "./features/lightspeed/contentMatchesWebview";
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
import { AnsibleCreatorInit } from "./features/contentCreator/scaffoldCollectionPage";
import { withInterpreter } from "./features/utils/commandRunner";
import { IFileSystemWatchers } from "./interfaces/watchers";
import { showPlaybookGenerationPage } from "./features/lightspeed/playbookGeneration";
import { ScaffoldAnsibleProject } from "./features/contentCreator/scaffoldAnsibleProjectPage";
import { LightspeedExplorerWebviewViewProvider } from "./features/lightspeed/explorerWebviewViewProvider";
import {
  LightspeedUser,
  AuthProviderType,
} from "./features/lightspeed/lightspeedUser";

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
    true,
  );
  await registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_INVENTORY_RESYNC,
    resyncAnsibleInventory,
    true,
  );

  await registerCommandWithTelemetry(
    context,
    telemetry,
    AnsibleCommands.ANSIBLE_PYTHON_SET_INTERPRETER,
    setPythonInterpreterWithCommand,
    true,
  );

  await registerCommandWithTelemetry(
    context,
    telemetry,
    LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
    lightspeedLogin,
    true,
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
    extSettings,
  );
  try {
    await pythonInterpreterManager.updatePythonInfoInStatusbar();
  } catch (error) {
    console.error(`Error updating python status bar: ${error}`);
  }

  /**
   * Handle "Ansible Lightspeed" in the extension
   */
  lightSpeedManager = new LightSpeedManager(
    context,
    client,
    extSettings,
    telemetry,
  );

  vscode.commands.executeCommand("setContext", "lightspeedConnectReady", true);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_STATUS_BAR_CLICK,
      () =>
        lightSpeedManager.statusBarProvider.lightSpeedStatusBarClickHandler(),
    ),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ContentMatchesWebview.viewType,
      lightSpeedManager.contentMatchesProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_FETCH_TRAINING_MATCHES,
      () => {
        lightSpeedManager.contentMatchesProvider.showContentMatches();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_CLEAR_TRAINING_MATCHES,
      () => {
        lightSpeedManager.contentMatchesProvider.clearContentMatches();
      },
    ),
  );

  const lightSpeedSuggestionProvider = new LightSpeedInlineSuggestionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: "file", language: "ansible" },
      lightSpeedSuggestionProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_COMMIT,
      inlineSuggestionCommitHandler,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_HIDE,
      async (
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit,
        userAction?: UserAction,
      ) => {
        await inlineSuggestionHideHandler(userAction);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_TRIGGER,
      inlineSuggestionTriggerHandler,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_SUGGESTION_MARKER,
      (
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit,
        position: vscode.Position,
      ) => inlineSuggestionReplaceMarker(position),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      LightSpeedCommands.LIGHTSPEED_PLAYBOOK_EXPLANATION,
      async () => {
        await playbookExplanation(
          context.extensionUri,
          client,
          lightSpeedManager.lightspeedAuthenticatedUser,
          lightSpeedManager.settingsManager,
        );
      },
    ),
  );

  // Listen for text selection changes
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(async () => {
      rejectPendingSuggestion();
    }),
  );

  // At window focus change, check if an inline suggestion is pending and ignore it if it exists.
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (state: vscode.WindowState) => {
      if (!state.focused) {
        ignorePendingSuggestion();
      }
    }),
  );

  // register ansible meta data in the statusbar tooltip (client-server)
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(
      async (editor: vscode.TextEditor | undefined) => {
        await updateAnsibleStatusBar(
          metaData,
          lightSpeedManager,
          pythonInterpreterManager,
        );
        if (editor) {
          await lightSpeedManager.ansibleContentFeedback(
            editor.document,
            AnsibleContentUploadTrigger.TAB_CHANGE,
          );
        } else {
          await ignorePendingSuggestion();
        }
        lightspeedExplorerProvider.refreshWebView();
      },
    ),
  );
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(async (document: vscode.TextDocument) => {
      await updateAnsibleStatusBar(
        metaData,
        lightSpeedManager,
        pythonInterpreterManager,
      );
      lightSpeedManager.ansibleContentFeedback(
        document,
        AnsibleContentUploadTrigger.FILE_OPEN,
      );
    }),
  );
  context.subscriptions.push(
    workspace.onDidCloseTextDocument(async (document: vscode.TextDocument) => {
      await lightSpeedManager.ansibleContentFeedback(
        document,
        AnsibleContentUploadTrigger.FILE_CLOSE,
      );
    }),
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration(async () => {
      await updateConfigurationChanges(
        metaData,
        pythonInterpreterManager,
        extSettings,
        lightSpeedManager,
      );
      await updateAnsibleStatusBar(
        metaData,
        lightSpeedManager,
        pythonInterpreterManager,
      );
    }),
  );

  context.subscriptions.push(
    workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
      inlineSuggestionTextDocumentChangeHandler(e);
    }),
  );

  context.subscriptions.push(
    workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
      inlineSuggestionTextDocumentChangeHandler(e);
    }),
  );

  context.subscriptions.push(
    vscode.authentication.onDidChangeSessions(async (e) => {
      if (!LightspeedUser.isLightspeedUserAuthProviderType(e.provider.id)) {
        return;
      }
      await lightSpeedManager.lightspeedAuthenticatedUser.refreshLightspeedUser();
      if (!lightSpeedManager.lightspeedAuthenticatedUser.isAuthenticated()) {
        lightSpeedManager.currentModelValue = undefined;
      }
      if (lightspeedExplorerProvider.webviewView) {
        lightspeedExplorerProvider.refreshWebView();
      }
      const rhUserHasSeat =
        await lightSpeedManager.lightspeedAuthenticatedUser.rhUserHasSeat();
      const rhOrgHasSubscription =
        await lightSpeedManager.lightspeedAuthenticatedUser.rhOrgHasSubscription();
      lightSpeedManager.statusBarProvider.statusBar.text =
        await lightSpeedManager.statusBarProvider.getLightSpeedStatusBarText(
          rhUserHasSeat,
          rhOrgHasSubscription,
        );
      lightSpeedManager.statusBarProvider.setLightSpeedStatusBarTooltip();
    }),
  );

  const lightspeedExplorerProvider = new LightspeedExplorerWebviewViewProvider(
    context.extensionUri,
    lightSpeedManager.lightspeedAuthenticatedUser,
  );

  // Register the Lightspeed provider for a Webview View
  const lightspeedExplorerDisposable = window.registerWebviewViewProvider(
    LightspeedExplorerWebviewViewProvider.viewType,
    lightspeedExplorerProvider,
  );
  context.subscriptions.push(lightspeedExplorerDisposable);

  // handle lightSpeed feedback
  const lightspeedFeedbackProvider = new LightspeedFeedbackWebviewViewProvider(
    context.extensionUri,
  );

  // Register the Lightspeed provider for a Webview View
  const lightspeedFeedbackDisposable = window.registerWebviewViewProvider(
    LightspeedFeedbackWebviewViewProvider.viewType,
    lightspeedFeedbackProvider,
  );

  context.subscriptions.push(lightspeedFeedbackDisposable);

  // Register the Lightspeed provider for a Webview
  const lightspeedFeedbackCommand = vscode.commands.registerCommand(
    LightSpeedCommands.LIGHTSPEED_FEEDBACK,
    () => {
      LightspeedFeedbackWebviewProvider.render(context.extensionUri);
    },
  );

  context.subscriptions.push(lightspeedFeedbackCommand);

  // Register the Sign in with Red Hat command
  const lightspeedSignInWithRedHatCommand = vscode.commands.registerCommand(
    LightSpeedCommands.LIGHTSPEED_SIGN_IN_WITH_REDHAT,
    async () => {
      // NOTE: We can't gate this check on if this extension is active,
      // because it only activates on an authentication request.
      if (
        !(await vscode.extensions.getExtension("redhat.vscode-redhat-account"))
      ) {
        window.showErrorMessage(
          "You must install the Red Hat Authentication extension to sign in with Red Hat.",
        );
        return;
      }
      lightspeedLogin(AuthProviderType.rhsso);
    },
  );
  context.subscriptions.push(lightspeedSignInWithRedHatCommand);

  // Register the Sign in with Lightspeed command
  const lightspeedSignInWithLightspeedCommand = vscode.commands.registerCommand(
    LightSpeedCommands.LIGHTSPEED_SIGN_IN_WITH_LIGHTSPEED,
    () => {
      lightspeedLogin(AuthProviderType.lightspeed);
    },
  );
  context.subscriptions.push(lightspeedSignInWithLightspeedCommand);

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
        testProvider,
      ),
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
          "--no-input",
        );

        let terminal;
        if (
          vscode.workspace.getConfiguration("ansible.ansible").reuseTerminal
        ) {
          terminal = vscode.window.terminals.find(
            (terminal) => terminal.name === "Ansible Terminal",
          ) as vscode.Terminal;
        }
        terminal = vscode.window.createTerminal({
          name: "Ansible Terminal",
          env: runEnv,
        });
        terminal.show();
        terminal.sendText(command);
      },
    ),
  );

  // open ansible-python workspace settings directly
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.python-settings.open",
      async () => {
        await vscode.commands.executeCommand(
          "workbench.action.openWorkspaceSettings",
          "ansible.python",
        );
      },
    ),
  );

  // open ansible-creator menu
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.menu", () => {
      AnsibleCreatorMenu.render(context.extensionUri);
    }),
  );

  // open ansible-creator init
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.content-creator.scaffold-ansible-collection",
      () => {
        AnsibleCreatorInit.render(context.extensionUri);
      },
    ),
  );

  // open ansible-creator ansible project scaffolding
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.content-creator.scaffold-ansible-project",
      () => {
        ScaffoldAnsibleProject.render(context.extensionUri);
      },
    ),
  );

  // open ansible-creator create
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.create", () => {
      window.showInformationMessage("This feature is coming soon. Stay tuned.");
    }),
  );

  // open ansible-creator sample
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.sample", () => {
      window.showInformationMessage("This feature is coming soon. Stay tuned.");
    }),
  );

  // Command to render a webview-based note view
  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_PLAYBOOK_GENERATION,
      async () => {
        await showPlaybookGenerationPage(
          context.extensionUri,
          client,
          lightSpeedManager.lightspeedAuthenticatedUser,
          lightSpeedManager.settingsManager,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.lightspeed.thumbsUpDown", () => {
      window.showInformationMessage("Thank you for your feedback!");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.lightspeed.enableExperimentalFeatures",
      () => {
        vscode.commands.executeCommand(
          "setContext",
          "redhat.ansible.lightspeedExperimentalEnabled",
          true,
        );
        lightspeedExplorerProvider.lightspeedExperimentalEnabled = true;
        lightspeedExplorerProvider.refreshWebView();
      },
    ),
  );
}

const startClient = async (
  context: ExtensionContext,
  telemetry: TelemetryManager,
) => {
  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "src", "server.js"),
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
    4,
  );
  const outputChannel = window.createOutputChannel(lsName);

  const clientOptions: LanguageClientOptions = {
    // register the server for Ansible documents
    documentSelector: [{ scheme: "file", language: "ansible" }],
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    errorHandler: telemetryErrorHandler,
    outputChannel: new TelemetryOutputChannel(
      outputChannel,
      telemetry.telemetryService,
    ),
  };

  client = new LanguageClient(
    "ansibleServer",
    "Ansible Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(
    client.onTelemetry((e) => {
      telemetry.telemetryService.send(e);
    }),
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
  pythonInterpreterManager: PythonInterpreterManager,
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
      },
    );
    client.sendNotification(new NotificationType(`resync/ansible-inventory`));
  }
}

export async function isLightspeedEnabled(): Promise<boolean> {
  if (
    !(await workspace.getConfiguration("ansible").get("lightspeed.enabled"))
  ) {
    await window.showErrorMessage(
      "Enable lightspeed services from settings to use the feature.",
    );
    return false;
  }
  return true;
}

async function lightspeedLogin(
  providerType: AuthProviderType | undefined,
): Promise<void> {
  if (!(await isLightspeedEnabled())) {
    return;
  }
  lightSpeedManager.currentModelValue = undefined;
  const authenticatedUser =
    await lightSpeedManager.lightspeedAuthenticatedUser.getLightspeedUserDetails(
      true,
      providerType,
    );
  if (authenticatedUser) {
    window.showInformationMessage(
      `Welcome back ${authenticatedUser.displayNameWithUserType}`,
    );
  }
}
