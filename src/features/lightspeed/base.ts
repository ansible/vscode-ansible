import * as vscode from "vscode";
import { LightSpeedAPI } from "@src/features/lightspeed/api";
import { TelemetryManager } from "@src/utils/telemetryUtils";
import { SettingsManager } from "@src/settings";
import { LightSpeedAuthenticationProvider } from "@src/features/lightspeed/lightSpeedOAuthProvider";
import {
  IDocumentTracker,
  IIncludeVarsContext,
  IWorkSpaceRolesContext,
  IVarsFileContext,
} from "@src/interfaces/lightspeed";
import { ContentMatchesWebview } from "@src/features/lightspeed/contentMatchesWebview";
import {
  ANSIBLE_LIGHTSPEED_AUTH_ID,
  ANSIBLE_LIGHTSPEED_AUTH_NAME,
} from "@src/features/lightspeed/utils/webUtils";
import { LightspeedStatusBar } from "@src/features/lightspeed/statusBar";
import {
  getCustomRolePaths,
  getCommonRoles,
} from "@src/features/utils/ansible";
import { watchRolesDirectory } from "@src/features/lightspeed/utils/watchers";
import type { LightSpeedServiceSettings } from "@src/interfaces/extensionSettings";
import { LightspeedUser } from "@src/features/lightspeed/lightspeedUser";
import { Log } from "@src/utils/logger";
import { LightspeedExplorerWebviewViewProvider } from "@src/features/lightspeed/explorerWebviewViewProvider";
import { ProviderManager } from "@src/features/lightspeed/providerManager";
import { LlmProviderSettings } from "@src/features/lightspeed/llmProviderSettings";

export class LightSpeedManager {
  private context;
  public settingsManager: SettingsManager;
  public telemetry: TelemetryManager;
  public llmProviderSettings: LlmProviderSettings;
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
  public lightspeedExplorerProvider:
    | LightspeedExplorerWebviewViewProvider
    | undefined;
  public providerManager: ProviderManager;
  private logger: Log;
  private _watchers: vscode.Disposable[] = [];
  private _contextInitAbort: AbortController | null = null;

  constructor(
    context: vscode.ExtensionContext,
    settingsManager: SettingsManager,
    telemetry: TelemetryManager,
    llmProviderSettings: LlmProviderSettings,
  ) {
    this.context = context;
    this.settingsManager = settingsManager;
    this.telemetry = telemetry;
    this.llmProviderSettings = llmProviderSettings;
    this.lightSpeedActivityTracker = {};
    this.currentModelValue = undefined;
    this.logger = new Log();
    // initiate the OAuth service for Ansible Lightspeed
    this.lightSpeedAuthenticationProvider =
      new LightSpeedAuthenticationProvider(
        this.context,
        this.settingsManager,
        this.logger,
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
      this.logger,
    );
    this.apiInstance = new LightSpeedAPI(
      this.settingsManager,
      this.lightspeedAuthenticatedUser,
      this.context,
      this.logger,
    );

    // Initialize the provider manager for routing requests to WCA or LLM providers
    this.providerManager = new ProviderManager(
      this.settingsManager,
      this.apiInstance,
    );

    this.contentMatchesProvider = new ContentMatchesWebview(
      this.context,
      this.settingsManager,
      this.apiInstance,
      this.lightspeedAuthenticatedUser,
    );

    // create a new project lightspeed status bar item that we can manage
    this.statusBarProvider = new LightspeedStatusBar(
      this.apiInstance,
      this.lightspeedAuthenticatedUser,
      context,
      settingsManager,
    );

    // Explorer webview has been replaced by LLM Provider panel
    // Generative AI features are now in the LLM Provider Settings panel
    this.lightspeedExplorerProvider = undefined;

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
      await this.setContext();
    }

    // set custom when clause for controlling visibility of views
    this.setCustomWhenClauseContext();
  }

  private resetContext(): void {
    this.ansibleVarFilesCache = {};
    this.ansibleRolesCache = {};
    for (const d of this._watchers) {
      d.dispose();
    }
    this._watchers = [];
    this._contextInitAbort?.abort();
    this._contextInitAbort = null;
  }

  public async setContext(): Promise<void> {
    this._contextInitAbort?.abort();
    const abort = new AbortController();
    this._contextInitAbort = abort;

    const newWatchers: vscode.Disposable[] = [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const workspaceFolder of workspaceFolders) {
        if (abort.signal.aborted) return;
        const workSpaceRoot = workspaceFolder.uri.fsPath;
        const rolesPath = await getCustomRolePaths(workSpaceRoot);
        await this.watchRolePaths(
          rolesPath,
          newWatchers,
          abort.signal,
          workSpaceRoot,
        );
      }
    }

    const commonRolesPath = getCommonRoles() || [];
    await this.watchRolePaths(commonRolesPath, newWatchers, abort.signal);

    if (abort.signal.aborted) {
      for (const d of newWatchers) {
        d.dispose();
      }
    } else {
      this._watchers = newWatchers;
    }
  }

  private async watchRolePaths(
    rolePaths: string[],
    watchers: vscode.Disposable[],
    signal: AbortSignal,
    workSpaceRoot?: string,
  ): Promise<void> {
    for (const rolePath of rolePaths) {
      if (signal.aborted) return;
      const disposables = await watchRolesDirectory(
        this,
        rolePath,
        workSpaceRoot,
      );
      watchers.push(...disposables);
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
