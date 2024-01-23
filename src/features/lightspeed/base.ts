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
import { AnsibleContentUploadTrigger } from "../../definitions/lightspeed";
import { ContentMatchesWebview } from "./contentMatchesWebview";
import {
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  ANSIBLE_LIGHTSPEED_AUTH_NAME,
} from "./utils/webUtils";
import { LightspeedStatusBar } from "./statusBar";
import { IVarsFileContext } from "../../interfaces/lightspeed";
import { getCustomRolePaths, getCommonRoles } from "../utils/ansible";
import { watchRolesDirectory } from "./utils/watchers";
import { LightSpeedServiceSettings } from "../../interfaces/extensionSettings";

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

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    telemetry: TelemetryManager
  ) {
    vscode.window.showWarningMessage(
      "NOTE: Due to overwhelming positive demand, we have extended the availability of the Ansible Lightspeed Technical Preview from December 31, 2023 to February 29, 2024."
    );
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
        ANSIBLE_LIGHTSPEED_AUTH_NAME
      );
    if (this.settingsManager.settings.lightSpeedService.enabled) {
      this.lightSpeedAuthenticationProvider.initialize();
    }
    this.apiInstance = new LightSpeedAPI(
      this.settingsManager,
      this.lightSpeedAuthenticationProvider
    );
    this.contentMatchesProvider = new ContentMatchesWebview(
      this.context,
      this.client,
      this.settingsManager,
      this.apiInstance,
      this.lightSpeedAuthenticationProvider
    );

    // create a new project lightspeed status bar item that we can manage
    this.statusBarProvider = new LightspeedStatusBar(
      this.apiInstance,
      this.lightSpeedAuthenticationProvider,
      context,
      client,
      settingsManager
    );

    // create workspace context for ansible roles
    this.setContext();
  }

  public async reInitialize(): Promise<void> {
    const lightspeedSettings = <LightSpeedServiceSettings>(
      vscode.workspace.getConfiguration("ansible").get("lightspeed")
    );
    const lightspeedEnabled = lightspeedSettings.enabled;

    if (!lightspeedEnabled) {
      await this.resetContext();
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
            "Please disable GitHub Copilot for Ansible Lightspeed file types to use Ansible Lightspeed."
          );
        }
      }
    }
  }

  private async resetContext(): Promise<void> {
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
    trigger: AnsibleContentUploadTrigger
  ): Promise<void> {
    if (
      document.languageId !== "ansible" ||
      !this.settingsManager.settings.lightSpeedService.enabled ||
      !this.settingsManager.settings.lightSpeedService.URL.trim()
    ) {
      return;
    }

    if (await this.lightSpeedAuthenticationProvider.rhUserHasSeat()) {
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
          `[ansible-lightspeed-feedback] Event ansibleContent not sent as the content of file ${documentUri} is same as previous event.`
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
        `[ansible-lightspeed-feedback] Event ansibleContent is not sent as the content of file ${documentUri} is empty.`
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
    this.apiInstance.feedbackRequest(inputData);
  }
}
