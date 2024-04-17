import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { v4 as uuidv4 } from "uuid";
import { LightSpeedAPI } from "./api";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { SettingsManager } from "../../settings";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import {
  FeedbackRequestParams,
  IDocumentTracker,
  IIncludeVarsContext,
  IWorkSpaceRolesContext,
} from "../../interfaces/lightspeed";
import {
  LIGHTSPEED_ME_AUTH_URL,
  AnsibleContentUploadTrigger,
  LightSpeedCommands,
} from "../../definitions/lightspeed";
import { ContentMatchesWebview } from "./contentMatchesWebview";
import {
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  ANSIBLE_LIGHTSPEED_AUTH_NAME,
  getBaseUri,
} from "./utils/webUtils";
import { LightspeedStatusBar } from "./statusBar";
import { IVarsFileContext } from "../../interfaces/lightspeed";
import { getCustomRolePaths, getCommonRoles } from "../utils/ansible";
import { watchRolesDirectory } from "./utils/watchers";
import {
  LightSpeedServiceSettings,
  UserResponse,
} from "../../interfaces/extensionSettings";
import { LightspeedExplorerWebviewViewProvider } from "./explorerWebviewViewProvider";

export class LightspeedAccessDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LightspeedAccessDenied";
  }
}

export class LightspeedNoLocalSession extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LightspeedNoLocalSession";
  }
}

export class LightSpeedManager {
  private context;
  public client;
  public settingsManager: SettingsManager;
  public telemetry: TelemetryManager;
  public apiInstance: LightSpeedAPI;
  public lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider;
  public lightSpeedActivityTracker: IDocumentTracker;
  public contentMatchesProvider: ContentMatchesWebview;
  public statusBarProvider: LightspeedStatusBar;
  public ansibleVarFilesCache: IVarsFileContext = {};
  public ansibleRolesCache: IWorkSpaceRolesContext = {};
  public ansibleIncludeVarsCache: IIncludeVarsContext = {};
  public currentModelValue: string | undefined = undefined;
  public orgTelemetryOptOut = false;
  public lightspeedExplorerProvider: LightspeedExplorerWebviewViewProvider;

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    telemetry: TelemetryManager,
  ) {
    this.context = context;
    this.client = client;
    this.settingsManager = settingsManager;
    this.telemetry = telemetry;
    this.lightSpeedActivityTracker = {};
    this.currentModelValue = undefined;
    // initiate the OAuth service for Ansible Lightspeed
    this.lightSpeedAuthenticationProvider =
      new LightSpeedAuthenticationProvider(
        this.context,
        this.settingsManager,
        ANSIBLE_LIGHTSPEED_AUTH_ID,
        ANSIBLE_LIGHTSPEED_AUTH_NAME,
      );
    if (this.settingsManager.settings.lightSpeedService.enabled) {
      this.lightSpeedAuthenticationProvider.initialize();
    }
    this.apiInstance = new LightSpeedAPI(
      this.settingsManager,
      this.lightSpeedAuthenticationProvider,
      this,
      this.context,
    );

    this.contentMatchesProvider = new ContentMatchesWebview(
      this.context,
      this.client,
      this.settingsManager,
      this.apiInstance,
      this.lightSpeedAuthenticationProvider,
    );

    // create a new project lightspeed status bar item that we can manage
    this.statusBarProvider = new LightspeedStatusBar(
      this.apiInstance,
      this.lightSpeedAuthenticationProvider,
      context,
      client,
      settingsManager,
    );
    this.lightspeedExplorerProvider = new LightspeedExplorerWebviewViewProvider(
      context.extensionUri,
      this.lightSpeedAuthenticationProvider,
    );
    const lightspeedExplorerDisposable =
      vscode.window.registerWebviewViewProvider(
        LightspeedExplorerWebviewViewProvider.viewType,
        this.lightspeedExplorerProvider,
      );
    context.subscriptions.push(lightspeedExplorerDisposable);

    // create workspace context for ansible roles
    this.setContext();

    // set custom when clause for controlling visibility of views
    this.setCustomWhenClauseContext();
  }

  /* Update the state of the local user and show the Connect button if needed */
  public async refreshUserInfo() {
    console.log(
      "[LightSpeedManager] Sending request for logged-in user info...",
    );

    try {
      const data: UserResponse = await this.apiInstance.getData(
        `${getBaseUri(this.settingsManager)}${LIGHTSPEED_ME_AUTH_URL}`,
      );
      console.log(`refreshUserInfo: ${data}`);
      console.log(`userIsconnected!, lets'refresh`);
      this.lightSpeedAuthenticationProvider.userIsConnected = true;
      this.lightspeedExplorerProvider.refreshWebView();
      this.statusBarProvider.updateLightSpeedStatusbar();
      // NOTE: This lightspeedConnectReady doesn't seem to be actually used
      vscode.commands.executeCommand(
        "setContext",
        "lightspeedConnectReady",
        true,
      );

      return data;
    } catch (error) {
      if (
        error instanceof LightspeedAccessDenied ||
        error instanceof LightspeedNoLocalSession
      ) {
        console.log("New to log in again!");
        if (this.lightSpeedAuthenticationProvider.userIsConnected) {
          console.log(`userIs Disconnected!, lets'refresh`);
          this.lightSpeedAuthenticationProvider.userIsConnected = false;
          this.lightspeedExplorerProvider.refreshWebView();
          // NOTE: This lightspeedConnectReady doesn't seem to be actually used
          vscode.commands.executeCommand(
            "setContext",
            "lightspeedConnectReady",
            false,
          );
        }
      }
    }
  }

  public async reInitialize(): Promise<void> {
    const lightspeedSettings = <LightSpeedServiceSettings>(
      vscode.workspace.getConfiguration("ansible").get("lightspeed")
    );
    const lightspeedEnabled = lightspeedSettings.enabled;

    if (!lightspeedEnabled) {
      this.resetContext();
      await this.lightSpeedAuthenticationProvider.dispose();
      this.statusBarProvider.statusBar.hide();
      return;
    } else {
      this.lightSpeedAuthenticationProvider.initialize();
      this.statusBarProvider.setLightSpeedStatusBarTooltip();
      this.setContext();
      if (lightspeedSettings.suggestions.enabled) {
        const githubConfig = (<unknown>(
          vscode.workspace.getConfiguration("github")
        )) as {
          copilot: { enable?: { ansible?: boolean } };
        };
        const copilotEnableForAnsible = githubConfig?.copilot?.enable?.ansible;
        if (copilotEnableForAnsible) {
          vscode.window.showInformationMessage(
            "Please disable GitHub Copilot for Ansible Lightspeed file types to use Ansible Lightspeed.",
          );
        }
      }
    }

    // set custom when clause for controlling visibility of views
    this.setCustomWhenClauseContext();
  }

  private resetContext(): void {
    this.ansibleVarFilesCache = {};
    this.ansibleRolesCache = {};
  }

  private setContext(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const workspaceFolder of workspaceFolders) {
        const workSpaceRoot = workspaceFolder.uri.fsPath;
        const rolesPath = getCustomRolePaths(workSpaceRoot);
        for (const rolePath of rolesPath) {
          watchRolesDirectory(this, rolePath, workSpaceRoot);
        }
      }
    }
    const commonRolesPath = getCommonRoles() || [];
    for (const rolePath of commonRolesPath) {
      watchRolesDirectory(this, rolePath);
    }
  }
  public async ansibleContentFeedback(
    document: vscode.TextDocument,
    trigger: AnsibleContentUploadTrigger,
  ): Promise<void> {
    if (
      document.languageId !== "ansible" ||
      !this.settingsManager.settings.lightSpeedService.enabled ||
      !this.settingsManager.settings.lightSpeedService.URL.trim()
    ) {
      return;
    }

    const rhUserHasSeat =
      await this.lightSpeedAuthenticationProvider.rhUserHasSeat();

    if (rhUserHasSeat && this.orgTelemetryOptOut) {
      return;
    }

    const currentFileContent = document.getText();
    const documentUri = document.uri.toString();
    let activityId: string;
    if (!this.lightSpeedActivityTracker.hasOwnProperty(documentUri)) {
      // Inline suggestion not yet triggered, return without sending event.
      return;
    }
    if (this.lightSpeedActivityTracker.hasOwnProperty(documentUri)) {
      activityId = this.lightSpeedActivityTracker[documentUri].activityId;
      const previousFileContent =
        this.lightSpeedActivityTracker[documentUri].content;

      if (trigger === AnsibleContentUploadTrigger.FILE_CLOSE) {
        // end previous activity tracker
        delete this.lightSpeedActivityTracker[documentUri];
      }

      if (previousFileContent === currentFileContent) {
        console.log(
          `[ansible-lightspeed-feedback] Event ansibleContent not sent as the content of file ${documentUri} is same as previous event.`,
        );
        return;
      }

      if (trigger === AnsibleContentUploadTrigger.TAB_CHANGE) {
        // start a new activity tracker
        this.lightSpeedActivityTracker[documentUri].activityId = uuidv4();
      }
    } else {
      activityId = uuidv4();
      this.lightSpeedActivityTracker[documentUri] = {
        activityId: activityId,
        content: currentFileContent,
      };
    }

    if (!currentFileContent.trim()) {
      console.log(
        `[ansible-lightspeed-feedback] Event ansibleContent is not sent as the content of file ${documentUri} is empty.`,
      );
      return;
    }

    const inputData: FeedbackRequestParams = {
      ansibleContent: {
        content: document.getText(),
        documentUri: documentUri,
        trigger: trigger,
        activityId: activityId,
      },
    };
    console.log("[ansible-lightspeed-feedback] Event ansibleContent sent.");
    this.apiInstance.feedbackRequest(inputData, this.orgTelemetryOptOut);
  }

  get inlineSuggestionsEnabled() {
    const lightspeedSettings = <LightSpeedServiceSettings>(
      vscode.workspace.getConfiguration("ansible").get("lightspeed")
    );
    const lightspeedEnabled = lightspeedSettings?.enabled;
    const lightspeedSuggestionsEnabled =
      lightspeedSettings?.suggestions.enabled;
    return lightspeedEnabled && lightspeedSuggestionsEnabled;
  }

  private setCustomWhenClauseContext(): void {
    vscode.commands.executeCommand(
      "setContext",
      "redhat.ansible.lightspeedSuggestionsEnabled",
      this.inlineSuggestionsEnabled,
    );
    vscode.commands.executeCommand(
      "setContext",
      "redhat.ansible.enableExperimentalFeatures",
      false,
    );
  }

  public async shouldReconnect(): Promise<boolean> {
    /* return True if user session has expired */
    await this.refreshUserInfo();
    if (this.lightSpeedAuthenticationProvider.userIsConnected) {
      return false;
    }
    try {
      return Boolean(this.lightSpeedAuthenticationProvider.getLocalSession());
    } catch (error) {
      if (error instanceof LightspeedNoLocalSession) {
        return false;
      } else {
        console.log(error);
      }
    }
    return false;
  }

  public async shouldConnect(): Promise<boolean> {
    /* return True if user has yet to connect to the server */
    await this.refreshUserInfo();
    if (this.lightSpeedAuthenticationProvider.userIsConnected) {
      return false;
    }
    try {
      return !this.lightSpeedAuthenticationProvider.getLocalSession();
    } catch (error) {
      if (error instanceof LightspeedNoLocalSession) {
        return true;
      } else {
        console.log(error);
      }
    }
    return true;
  }

  public async attemptReconnect() {
    /* expose a message asking the user to Reconnect */
    const action = "Reconnect";
    vscode.window
      .showInformationMessage("Your Lightspeed session has expired", action)
      .then((selection) => {
        if (selection === action) {
          vscode.commands.executeCommand(
            LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
          );
        }
      });
  }

  public async attemptConnect() {
    /* expose a message asking the user to Connect */
    const action = "Connect";
    vscode.window
      .showInformationMessage("Please connect to LightSpeed", action)
      .then((selection) => {
        if (selection === action) {
          vscode.commands.executeCommand(
            LightSpeedCommands.LIGHTSPEED_AUTH_REQUEST,
          );
        }
      });
  }
}
