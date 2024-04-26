import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { LightSpeedAPI } from "./api";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { SettingsManager } from "../../settings";
import { LightSpeedAuthenticationProvider } from "./lightSpeedOAuthProvider";
import {
  IDocumentTracker,
  IIncludeVarsContext,
  IWorkSpaceRolesContext,
} from "../../interfaces/lightspeed";
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
import { LightspeedUser } from "./lightspeedUser";
import { Log } from "../../utils/logger";
import { LightspeedExplorerWebviewViewProvider } from "./explorerWebviewViewProvider";

export class LightSpeedManager {
  private context;
  public client;
  public settingsManager: SettingsManager;
  public telemetry: TelemetryManager;
  public apiInstance: LightSpeedAPI;
  public lightSpeedAuthenticationProvider: LightSpeedAuthenticationProvider;
  public lightspeedAuthenticatedUser: LightspeedUser;
  public lightSpeedActivityTracker: IDocumentTracker;
  public contentMatchesProvider: ContentMatchesWebview;
  public statusBarProvider: LightspeedStatusBar;
  public ansibleVarFilesCache: IVarsFileContext = {};
  public ansibleRolesCache: IWorkSpaceRolesContext = {};
  public ansibleIncludeVarsCache: IIncludeVarsContext = {};
  public currentModelValue: string | undefined = undefined;
  public lightspeedExplorerProvider: LightspeedExplorerWebviewViewProvider;
  private _logger: Log;

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
    this._logger = new Log();
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
    this.lightspeedAuthenticatedUser = new LightspeedUser(
      this.context,
      this.settingsManager,
      this.lightSpeedAuthenticationProvider,
      this._logger,
    );
    this.apiInstance = new LightSpeedAPI(
      this.settingsManager,
      this.lightspeedAuthenticatedUser,
      this.context,
    );
    this.contentMatchesProvider = new ContentMatchesWebview(
      this.context,
      this.client,
      this.settingsManager,
      this.apiInstance,
      this.lightspeedAuthenticatedUser,
    );

    // create a new project lightspeed status bar item that we can manage
    this.statusBarProvider = new LightspeedStatusBar(
      this.apiInstance,
      this.lightspeedAuthenticatedUser,
      context,
      client,
      settingsManager,
    );

    this.lightspeedExplorerProvider = new LightspeedExplorerWebviewViewProvider(
      context.extensionUri,
      this.lightspeedAuthenticatedUser,
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
}
