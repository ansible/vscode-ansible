/**
 * Python Environment Service
 *
 * Provides a wrapper around the Microsoft Python Environments extension API
 * with fallback support for the `ansible.python.interpreterPath` setting.
 *
 * When ms-python.vscode-python-envs is available, it uses the full API.
 * When the extension is missing (e.g. in Dev Spaces or code-server with
 * OpenVSX), the service falls back to the interpreter path configured in
 * Ansible extension settings so the extension still activates and works.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import {
  PythonEnvironmentApi,
  PythonEnvironment,
  DidChangeEnvironmentEventArgs,
  GetEnvironmentScope,
  PYTHON_ENVS_EXTENSION_ID,
} from "@src/types/pythonEnvApi";
import { resolveInterpreterPath } from "@src/features/utils/interpreterPathResolver";

export class PythonEnvironmentService implements vscode.Disposable {
  private static _instance: PythonEnvironmentService | undefined;
  private _pythonEnvApi: PythonEnvironmentApi | undefined;
  private _initialized: boolean = false;
  private _disposables: vscode.Disposable[] = [];

  private _onDidChangeEnvironment =
    new vscode.EventEmitter<DidChangeEnvironmentEventArgs>();
  public readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

  // eslint-disable-next-line no-empty-function
  private constructor() {}

  public static getInstance(): PythonEnvironmentService {
    if (!PythonEnvironmentService._instance) {
      PythonEnvironmentService._instance = new PythonEnvironmentService();
    }
    return PythonEnvironmentService._instance;
  }

  /**
   * Initialize the service by connecting to the Python Environments extension.
   * Returns true when the native API is available; false means the service
   * will operate in fallback mode using `ansible.python.interpreterPath`.
   */
  public async initialize(): Promise<boolean> {
    if (this._initialized) {
      return this._pythonEnvApi !== undefined;
    }

    console.log(
      `[Ansible] Looking for Python Environments extension: ${PYTHON_ENVS_EXTENSION_ID}`,
    );

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

        const exports = pythonEnvExt.exports;
        console.log(
          `[Ansible] Python Environments exports: ${typeof exports}, hasGetEnvironment: ${exports && typeof exports.getEnvironment === "function"}`,
        );

        if (exports && typeof exports.getEnvironment === "function") {
          this._pythonEnvApi = exports;

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
          await this._checkAndPromptForSetting();
        }
      } catch (error) {
        console.error(
          `[Ansible] Failed to activate Python Environments extension: ${error}`,
        );
      }
    } else {
      console.log(
        `[Ansible] Python Environments extension (${PYTHON_ENVS_EXTENSION_ID}) is not installed. ` +
          `Falling back to ansible.python.interpreterPath setting.`,
      );
    }

    this._initialized = true;
    return this._pythonEnvApi !== undefined;
  }

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
   * Check if the native Python Environments extension API is available.
   * Note: even when this returns false, `getEnvironment()` may still return
   * a result from the `ansible.python.interpreterPath` fallback.
   */
  public isAvailable(): boolean {
    return this._pythonEnvApi !== undefined;
  }

  /**
   * Get the current Python environment for a given scope.
   *
   * Resolution order:
   * 1. Python Environments extension API (if available)
   * 2. `ansible.python.interpreterPath` setting (fallback)
   */
  public async getEnvironment(
    scope?: GetEnvironmentScope,
  ): Promise<PythonEnvironment | undefined> {
    await this.initialize();

    if (this._pythonEnvApi) {
      try {
        const env = await this._pythonEnvApi.getEnvironment(scope);
        if (env) return env;
      } catch (error) {
        console.error(`[Ansible] Error getting Python environment: ${error}`);
      }
    }

    return this._getFallbackEnvironment(scope);
  }

  /**
   * Build a synthetic PythonEnvironment from the
   * `ansible.python.interpreterPath` setting when the native API
   * is unavailable or returns nothing.
   */
  private _getFallbackEnvironment(
    scope?: GetEnvironmentScope,
  ): PythonEnvironment | undefined {
    const interpreterPath = this._resolveInterpreterPathSetting(scope);
    if (!interpreterPath) return undefined;

    return {
      envId: { id: "ansible-settings", managerId: "ansible-settings" },
      name: path.basename(interpreterPath),
      displayName: interpreterPath,
      displayPath: interpreterPath,
      version: "",
      environmentPath: vscode.Uri.file(path.dirname(interpreterPath)),
      execInfo: { run: { executable: interpreterPath } },
      sysPrefix: "",
    };
  }

  /**
   * Resolve the `ansible.python.interpreterPath` setting, expanding
   * `~`, `${workspaceFolder}`, and relative paths.
   */
  private _resolveInterpreterPathSetting(
    scope?: GetEnvironmentScope,
  ): string | undefined {
    const ansibleConfig = vscode.workspace.getConfiguration("ansible", scope);
    const interpreterPath = ansibleConfig.get<string>("python.interpreterPath");
    if (!interpreterPath || interpreterPath.trim() === "") return undefined;
    return resolveInterpreterPath(interpreterPath, scope) || interpreterPath;
  }

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

  public async getExecutablePath(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.execInfo.run.executable;
  }

  public async getVersion(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.version;
  }

  public async getDisplayName(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.displayName;
  }

  public getApi(): PythonEnvironmentApi | undefined {
    return this._pythonEnvApi;
  }

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
   * Open the Python environment picker. Tries, in order:
   * 1. python-envs.set (Python Environments extension)
   * 2. python.setInterpreter (classic Python extension)
   * 3. Manual configuration via ansible.python.interpreterPath
   */
  public async selectEnvironment(): Promise<void> {
    if (this._pythonEnvApi) {
      try {
        await vscode.commands.executeCommand("python-envs.set");
        return;
      } catch (error) {
        console.error(
          `[Ansible] Error opening Python environment picker: ${error}`,
        );
      }
    }

    const pythonEnvExt = vscode.extensions.getExtension(
      PYTHON_ENVS_EXTENSION_ID,
    );
    if (pythonEnvExt && !this._pythonEnvApi) {
      await this._checkAndPromptForSetting();
      return;
    }

    try {
      await vscode.commands.executeCommand("python.setInterpreter");
      return;
    } catch {
      // Classic Python extension not available either
    }

    await this._offerManualConfiguration();
  }

  private async _offerManualConfiguration(): Promise<void> {
    const setPath = "Set Interpreter Path";
    const installExt = "Install Python Environments Extension";

    const selection = await vscode.window.showWarningMessage(
      "No Python environment extension is available. " +
        "You can set the Python interpreter path manually in settings, " +
        "or install the Python Environments extension for richer support.",
      setPath,
      installExt,
    );

    if (selection === setPath) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "ansible.python.interpreterPath",
      );
    } else if (selection === installExt) {
      await vscode.commands.executeCommand(
        "workbench.extensions.installExtension",
        PYTHON_ENVS_EXTENSION_ID,
      );
    }
  }

  public dispose(): void {
    this._disposables.forEach((d) => {
      d.dispose();
    });
    this._disposables = [];
    this._onDidChangeEnvironment.dispose();
  }
}
