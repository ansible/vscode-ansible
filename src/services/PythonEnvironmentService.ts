/**
 * Python Environment Service
 *
 * Provides a wrapper around the Microsoft Python Environments extension API.
 * Handles initialization, environment retrieval, and event propagation.
 *
 * Note: This service uses ms-python.vscode-python-envs extension.
 * Users need to enable 'python.useEnvironmentsExtension' setting for full API access.
 */

import * as vscode from "vscode";
import {
  PythonEnvironmentApi,
  PythonEnvironment,
  DidChangeEnvironmentEventArgs,
  GetEnvironmentScope,
  PYTHON_ENVS_EXTENSION_ID,
} from "../types/pythonEnvApi";

export class PythonEnvironmentService implements vscode.Disposable {
  private static _instance: PythonEnvironmentService | undefined;
  private _pythonEnvApi: PythonEnvironmentApi | undefined;
  private _initialized: boolean = false;
  private _disposables: vscode.Disposable[] = [];

  // Event emitter for environment changes
  private _onDidChangeEnvironment =
    new vscode.EventEmitter<DidChangeEnvironmentEventArgs>();
  public readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

  // eslint-disable-next-line no-empty-function
  private constructor() {}

  /**
   * Get the singleton instance of PythonEnvironmentService
   */
  public static getInstance(): PythonEnvironmentService {
    if (!PythonEnvironmentService._instance) {
      PythonEnvironmentService._instance = new PythonEnvironmentService();
    }
    return PythonEnvironmentService._instance;
  }

  /**
   * Initialize the service by connecting to the Python Environments extension
   */
  public async initialize(): Promise<boolean> {
    if (this._initialized) {
      return this._pythonEnvApi !== undefined;
    }

    console.log(
      `[Ansible] Looking for Python Environments extension: ${PYTHON_ENVS_EXTENSION_ID}`,
    );

    // Get the Python Environments extension
    const pythonEnvExt = vscode.extensions.getExtension<PythonEnvironmentApi>(
      PYTHON_ENVS_EXTENSION_ID,
    );

    if (pythonEnvExt) {
      console.log(
        `[Ansible] Found Python Environments extension, isActive: ${pythonEnvExt.isActive}`,
      );
      try {
        if (!pythonEnvExt.isActive) {
          console.log("[Ansible] Activating Python Environments extension...");
          await pythonEnvExt.activate();
        }

        // Check if the extension exports the API
        const exports = pythonEnvExt.exports;
        console.log(
          `[Ansible] Python Environments exports: ${typeof exports}, hasGetEnvironment: ${exports && typeof exports.getEnvironment === "function"}`,
        );

        if (exports && typeof exports.getEnvironment === "function") {
          this._pythonEnvApi = exports;

          // Subscribe to environment change events if available
          if (this._pythonEnvApi?.onDidChangeEnvironment) {
            const listener = this._pythonEnvApi.onDidChangeEnvironment(
              (event) => {
                this._onDidChangeEnvironment.fire(event);
              },
            );
            this._disposables.push(listener);
          }

          console.log(
            "[Ansible] Python Environment Service initialized successfully",
          );
        } else {
          console.warn(
            "[Ansible] Python Environments extension found but API not available.",
          );
          // Check and prompt for the setting
          await this._checkAndPromptForSetting();
        }
      } catch (error) {
        console.error(
          `[Ansible] Failed to activate Python Environments extension: ${error}`,
        );
      }
    } else {
      console.warn(
        `[Ansible] Python Environments extension (${PYTHON_ENVS_EXTENSION_ID}) is not installed.`,
      );
    }

    this._initialized = true;
    return this._pythonEnvApi !== undefined;
  }

  /**
   * Check if the required setting is enabled and prompt if not
   */
  private async _checkAndPromptForSetting(): Promise<void> {
    const pythonConfig = vscode.workspace.getConfiguration("python");
    const useEnvsExtension = pythonConfig.get<boolean>(
      "useEnvironmentsExtension",
    );

    if (!useEnvsExtension) {
      console.log(
        "[Ansible] python.useEnvironmentsExtension is not enabled, prompting user...",
      );

      const enableSetting = "Enable Setting";
      const learnMore = "Learn More";

      const selection = await vscode.window.showWarningMessage(
        "The Python Environments extension requires 'python.useEnvironmentsExtension' to be enabled for full functionality. " +
          "Enable this setting to use Python environment auto-activation in terminals.",
        enableSetting,
        learnMore,
      );

      if (selection === enableSetting) {
        await pythonConfig.update(
          "useEnvironmentsExtension",
          true,
          vscode.ConfigurationTarget.Global,
        );

        const reloadSelection = await vscode.window.showInformationMessage(
          "Setting enabled. Please reload VS Code for the changes to take effect.",
          "Reload Now",
        );

        if (reloadSelection === "Reload Now") {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      } else if (selection === learnMore) {
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-python-envs",
          ),
        );
      }
    }
  }

  /**
   * Check if the Python Environments extension API is available
   */
  public isAvailable(): boolean {
    return this._pythonEnvApi !== undefined;
  }

  /**
   * Get the current Python environment for a given scope
   * @param scope - Optional URI to get environment for a specific workspace folder
   */
  public async getEnvironment(
    scope?: GetEnvironmentScope,
  ): Promise<PythonEnvironment | undefined> {
    await this.initialize();

    if (!this._pythonEnvApi) {
      return undefined;
    }

    try {
      return await this._pythonEnvApi.getEnvironment(scope);
    } catch (error) {
      console.error(`[Ansible] Error getting Python environment: ${error}`);
      return undefined;
    }
  }

  /**
   * Get all available Python environments
   * @param scope - URI, 'all', or 'global' to specify which environments to retrieve
   */
  public async getEnvironments(
    scope: vscode.Uri | "all" | "global" = "all",
  ): Promise<PythonEnvironment[]> {
    await this.initialize();

    if (!this._pythonEnvApi) {
      return [];
    }

    try {
      return await this._pythonEnvApi.getEnvironments(scope);
    } catch (error) {
      console.error(`[Ansible] Error getting Python environments: ${error}`);
      return [];
    }
  }

  /**
   * Get the Python executable path for the current environment
   * @param scope - Optional URI to get environment for a specific workspace folder
   */
  public async getExecutablePath(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.execInfo.run.executable;
  }

  /**
   * Get the Python version for the current environment
   * @param scope - Optional URI to get environment for a specific workspace folder
   */
  public async getVersion(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.version;
  }

  /**
   * Get environment display name (e.g., "Python 3.11.0 (venv)")
   * @param scope - Optional URI to get environment for a specific workspace folder
   */
  public async getDisplayName(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.displayName;
  }

  /**
   * Get the raw Python Environment API for advanced usage
   */
  public getApi(): PythonEnvironmentApi | undefined {
    return this._pythonEnvApi;
  }

  /**
   * Show a warning message if Python Environments extension is not available
   */
  public showExtensionNotInstalledWarning(): void {
    vscode.window
      .showWarningMessage(
        "The Python Environments extension is not installed. " +
          "Install it for Python environment management and terminal auto-activation.",
        "Install Extension",
      )
      .then((selection) => {
        if (selection === "Install Extension") {
          vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            PYTHON_ENVS_EXTENSION_ID,
          );
        }
      });
  }

  /**
   * Open the Python environment picker from the Python Environments extension
   */
  public async selectEnvironment(): Promise<void> {
    if (!this._pythonEnvApi) {
      // Extension not available or API not exported, prompt to install/enable
      const pythonEnvExt = vscode.extensions.getExtension(
        PYTHON_ENVS_EXTENSION_ID,
      );
      if (pythonEnvExt) {
        // Extension installed but API not available - prompt for setting
        await this._checkAndPromptForSetting();
      } else {
        // Extension not installed
        this.showExtensionNotInstalledWarning();
      }
      return;
    }

    try {
      await vscode.commands.executeCommand("python-envs.set");
    } catch (error) {
      console.error(
        `[Ansible] Error opening Python environment picker: ${error}`,
      );
      // Fall back to classic Python extension command
      try {
        await vscode.commands.executeCommand("python.setInterpreter");
      } catch {
        vscode.window.showErrorMessage(
          "Unable to open Python environment picker. " +
            "Please ensure the Python Environments extension is installed and enabled.",
        );
      }
    }
  }

  public dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
    this._onDidChangeEnvironment.dispose();
  }
}
