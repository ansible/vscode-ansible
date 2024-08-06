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
  setDocumentChanged,
} from "./features/lightspeed/inlineSuggestions";
import { playbookExplanation } from "./features/lightspeed/playbookExplanation";
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
import { AnsibleCreatorMenu } from "./features/playbookGeneration/welcomePage";
import { CreateAnsibleCollection } from "./features/contentCreator/createAnsibleCollectionPage";
import { withInterpreter } from "./features/utils/commandRunner";
import { IFileSystemWatchers } from "./interfaces/watchers";
import { showPlaybookGenerationPage } from "./features/lightspeed/playbookGeneration";
import { ExecException, execSync } from "child_process";
import { CreateAnsibleProject } from "./features/contentCreator/createAnsibleProjectPage";
// import { LightspeedExplorerWebviewViewProvider } from "./features/lightspeed/explorerWebviewViewProvider";
import {
  LightspeedUser,
  AuthProviderType,
} from "./features/lightspeed/lightspeedUser";
import { PlaybookFeedbackEvent } from "./interfaces/lightspeed";

export let client: LanguageClient;
export let lightSpeedManager: LightSpeedManager;
export const globalFileSystemWatcher: IFileSystemWatchers = {};

const lsName = "Ansible Support";
let lsOutputChannel: vscode.OutputChannel;

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

  new AnsiblePlaybookRunProvider(context, extSettings, telemetry);

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
  ["file", "untitled"].forEach((scheme) => {
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        { scheme, language: "ansible" },
        lightSpeedSuggestionProvider,
      ),
    );
  });

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
        await playbookExplanation(context.extensionUri);
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
        if (!editor) {
          await ignorePendingSuggestion();
        }
        lightSpeedManager.lightspeedExplorerProvider.refreshWebView();
      },
    ),
  );
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(async () => {
      await updateAnsibleStatusBar(
        metaData,
        lightSpeedManager,
        pythonInterpreterManager,
      );
      lightSpeedManager.lightspeedExplorerProvider.refreshWebView();
      metaData.sendAnsibleMetadataTelemetry();
    }),
  );
  context.subscriptions.push(
    workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent) => {
        if (
          event.document === vscode.window.activeTextEditor?.document &&
          event.contentChanges.length > 0 &&
          event.contentChanges[0].text[0] !== "\n"
        ) {
          setDocumentChanged(true);
        }
      },
    ),
  );
  context.subscriptions.push(
    workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent) => {
        if (
          event.document === vscode.window.activeTextEditor?.document &&
          event.contentChanges.length > 0 &&
          event.contentChanges[0].text[0] !== "\n"
        ) {
          setDocumentChanged(true);
        }
      },
    ),
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
      metaData.sendAnsibleMetadataTelemetry();
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
      if (lightSpeedManager.lightspeedExplorerProvider.webviewView) {
        lightSpeedManager.lightspeedExplorerProvider.refreshWebView();
      }
      lightSpeedManager.statusBarProvider.updateLightSpeedStatusbar();
    }),
  );

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
      if (!vscode.extensions.getExtension("redhat.vscode-redhat-account")) {
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

  // open ansible extension workspace settings directly
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.extension-settings.open",
      async () => {
        await vscode.commands.executeCommand(
          "workbench.action.openWorkspaceSettings",
          "ansible",
        );
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

  // open ansible-content-creator menu
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.content-creator.menu", () => {
      AnsibleCreatorMenu.render(context.extensionUri);
    }),
  );

  // open web-view for creating ansible collection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.content-creator.create-ansible-collection",
      () => {
        CreateAnsibleCollection.render(context.extensionUri);
      },
    ),
  );

  // open web-view for creating ansible playbook project
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.content-creator.create-ansible-project",
      () => {
        CreateAnsibleProject.render(context.extensionUri);
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
          lightSpeedManager.lightspeedAuthenticatedUser,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.lightspeed.thumbsUpDown",
      async (param: PlaybookFeedbackEvent) => {
        if (param.explanationId) {
          lightSpeedManager.apiInstance.feedbackRequest(
            { playbookExplanationFeedback: param },
            true,
            true,
          );
        } else if (param.generationId) {
          lightSpeedManager.apiInstance.feedbackRequest(
            { playbookGenerationFeedback: param },
            true,
            true,
          );
        } else {
          lightSpeedManager.apiInstance.feedbackRequest(
            { playbookOutlineFeedback: param },
            true,
            true,
          );
        }
      },
    ),
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
        lightSpeedManager.lightspeedExplorerProvider.lightspeedExperimentalEnabled =
          true;
        lightSpeedManager.lightspeedExplorerProvider.refreshWebView();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_OPEN_TRIAL_PAGE,
      () => {
        vscode.env.openExternal(
          vscode.Uri.parse(
            lightSpeedManager.settingsManager.settings.lightSpeedService.URL +
              "/trial",
          ),
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      LightSpeedCommands.LIGHTSPEED_REFRESH_EXPLORER_VIEW,
      async () => {
        await lightSpeedManager.lightspeedAuthenticatedUser.updateUserInformation();
        lightSpeedManager.lightspeedExplorerProvider.refreshWebView();
      },
    ),
  );

  // getting started walkthrough command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.walkthrough.gettingStarted.setLanguage",
      () => {
        vscode.commands.executeCommand("runCommands", {
          commands: [
            "workbench.action.focusRightGroup",
            "workbench.action.editor.changeLanguageMode",
          ],
        });
      },
    ),
  );

  // install ansible development tools
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ansible.install-ansible-dev-tools",
      async () => {
        const extSettings = new SettingsManager();
        await extSettings.initialize();

        const pythonInterpreter = extSettings.settings.interpreterPath;

        // specify the current python interpreter path in the pip installation
        const [command, runEnv] = withInterpreter(
          extSettings.settings,
          `${pythonInterpreter} -m pip install ansible-dev-tools`,
          "--no-input",
        );

        const outputChannel = window.createOutputChannel(`Ansible Logs`);

        let commandOutput = "";
        let commandPassed = false;

        vscode.window.withProgress(
          {
            title: "Please wait...",
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
          },
          async (_, token) => {
            // You code to process the progress

            token.onCancellationRequested(async () => {
              await vscode.window.showErrorMessage("Installation cancelled");
            });

            try {
              const result = execSync(command, {
                env: runEnv,
              }).toString();
              commandOutput = result;
              outputChannel.append(commandOutput);
              commandPassed = true;
            } catch (error) {
              let errorMessage: string;
              if (error instanceof Error) {
                const execError = error as ExecException & {
                  // according to the docs, these are always available
                  stdout: string;
                  stderr: string;
                };

                errorMessage = execError.stdout
                  ? execError.stdout
                  : execError.stderr;
                errorMessage += execError.message;
              } else {
                errorMessage = `Exception: ${JSON.stringify(error)}`;
              }

              commandOutput = errorMessage;
              outputChannel.append(commandOutput);
              commandPassed = false;
            }
          },
        );

        if (commandPassed) {
          const selection = await vscode.window.showInformationMessage(
            "Ansible Development Tools installed successfully.",
            "Show Logs",
          );

          if (selection !== undefined) {
            outputChannel.show();
          }
        } else {
          const selection = await vscode.window.showErrorMessage(
            "Ansible Development Tools failed to install.",
            "Show Logs",
          );

          if (selection !== undefined) {
            outputChannel.show();
          }
        }
      },
    ),
  );

  // open ansible language server logs
  context.subscriptions.push(
    vscode.commands.registerCommand("ansible.open-language-server-logs", () => {
      lsOutputChannel.show();
    }),
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
  lsOutputChannel = outputChannel;

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

  // TODO: Temporary pause this telemetry event, will be enabled in future
  // context.subscriptions.push(
  //   client.onTelemetry((e) => {
  //     telemetry.telemetryService.send(e);
  //   }),
  // );

  try {
    await client.start();

    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });
    // TODO: Temporary pause this telemetry event, will be enabled in future
    // telemetry.sendStartupTelemetryEvent(true);
  } catch (err) {
    let errorMessage: string;
    if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }
    console.error(`Language Client initialization failed with ${errorMessage}`);
    // TODO: Temporary pause this telemetry event, will be enabled in future
    // telemetry.sendStartupTelemetryEvent(false, errorMessage);
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
