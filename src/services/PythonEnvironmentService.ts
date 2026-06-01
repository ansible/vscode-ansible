/**
 * Python Environment Service
 *
 * Provides a wrapper around the Microsoft Python Environments extension API
 * with automatic fallback to ms-python.python when the PET binary is missing
 * (common on OpenVSX-based editors like VSCodium, Dev Spaces, Kiro).
 *
 * Resolution chain:
 *   1. ms-python.vscode-python-envs (primary — requires PET binary)
 *   2. ms-python.python environments API (fallback — uses its own discovery)
 *
 * The ansible.python.interpreterPath setting is handled separately by
 * SettingsManager and the language server — this service does not read it.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PythonExtension, ResolvedEnvironment } from "@vscode/python-extension";
import {
  PythonEnvironmentApi,
  PythonEnvironment,
  DidChangeEnvironmentEventArgs,
  GetEnvironmentScope,
  PYTHON_ENVS_EXTENSION_ID,
} from "@src/types/pythonEnvApi";

const PYTHON_EXT_ID = "ms-python.python";

export class PythonEnvironmentService implements vscode.Disposable {
  private static _instance: PythonEnvironmentService | undefined;
  private _pythonEnvApi: PythonEnvironmentApi | undefined;
  private _pythonExtApi: PythonExtension | undefined;
  private _initialized: boolean = false;
  private _petWarningShown: boolean = false;
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
   * Initialize the service. Tries the Environments extension first; if PET
   * is missing falls back to the main Python extension's environments API.
   */
  public async initialize(): Promise<boolean> {
    if (this._initialized) {
      return (
        this._pythonEnvApi !== undefined || this._pythonExtApi !== undefined
      );
    }

    console.log(
      `[Ansible] Looking for Python Environments extension: ${PYTHON_ENVS_EXTENSION_ID}`,
    );

    const envsExt = vscode.extensions.getExtension<PythonEnvironmentApi>(
      PYTHON_ENVS_EXTENSION_ID,
    );

    if (envsExt) {
      const petAvailable = this._isPetAvailable(envsExt.extensionPath);

      if (petAvailable) {
        await this._initFromEnvsExtension(envsExt);
      } else {
        console.warn(
          "[Ansible] PET binary not found — environment discovery will be degraded",
        );
        this._showPetWarning();
        await this._initFromPythonExtension();
      }
    } else {
      console.warn(
        `[Ansible] Python Environments extension (${PYTHON_ENVS_EXTENSION_ID}) not installed, trying ms-python.python`,
      );
      await this._initFromPythonExtension();
    }

    this._initialized = true;
    return this._pythonEnvApi !== undefined || this._pythonExtApi !== undefined;
  }

  // ---------------------------------------------------------------------------
  // PET detection
  // ---------------------------------------------------------------------------

  /**
   * Check whether the PET binary exists in the Environments extension's
   * install directory. Returns false when the python-env-tools directory
   * is missing entirely (OpenVSX universal build issue).
   */
  private _isPetAvailable(extensionPath: string): boolean {
    const binary = process.platform === "win32" ? "pet.exe" : "pet";
    const petPath = path.join(extensionPath, "python-env-tools", "bin", binary);
    const exists = fs.existsSync(petPath);
    console.log(
      `[Ansible] PET binary check: ${petPath} — ${exists ? "found" : "missing"}`,
    );
    return exists;
  }

  // ---------------------------------------------------------------------------
  // Primary: ms-python.vscode-python-envs
  // ---------------------------------------------------------------------------

  private async _initFromEnvsExtension(
    ext: vscode.Extension<PythonEnvironmentApi>,
  ): Promise<void> {
    try {
      if (!ext.isActive) {
        console.log("[Ansible] Activating Python Environments extension...");
        await ext.activate();
      }

      const exports = ext.exports;
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
          "[Ansible] Python Environment Service initialized via Environments extension",
        );
      } else {
        console.warn(
          "[Ansible] Python Environments extension found but API not available",
        );
        await this._checkAndPromptForSetting();
        await this._initFromPythonExtension();
      }
    } catch (error) {
      console.error(
        `[Ansible] Failed to activate Python Environments extension: ${error}`,
      );
      await this._initFromPythonExtension();
    }
  }

  // ---------------------------------------------------------------------------
  // Fallback: ms-python.python
  // ---------------------------------------------------------------------------

  private async _initFromPythonExtension(): Promise<void> {
    try {
      const pythonExt = vscode.extensions.getExtension(PYTHON_EXT_ID);
      if (!pythonExt) {
        console.warn(
          `[Ansible] Python extension (${PYTHON_EXT_ID}) not installed`,
        );
        return;
      }

      const api = await PythonExtension.api();

      const READY_TIMEOUT_MS = 5000;
      await Promise.race([
        api.ready,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            console.warn(
              `[Ansible] Python extension api.ready timed out after ${READY_TIMEOUT_MS}ms — proceeding with partial discovery`,
            );
            resolve();
          }, READY_TIMEOUT_MS);
        }),
      ]);

      this._pythonExtApi = api;

      // Wire up environment change events
      const listener = api.environments.onDidChangeActiveEnvironmentPath(() => {
        this._onDidChangeEnvironment.fire({});
      });
      this._disposables.push(listener);

      console.log(
        "[Ansible] Python Environment Service initialized via Python extension (fallback)",
      );
    } catch (error) {
      console.error(
        `[Ansible] Failed to initialize Python extension fallback: ${error}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Adapter: map ms-python.python's ResolvedEnvironment to our PythonEnvironment
  // ---------------------------------------------------------------------------

  private _adaptResolvedEnvironment(
    resolved: ResolvedEnvironment,
  ): PythonEnvironment {
    const executablePath = resolved.executable.uri?.fsPath ?? "";
    const versionStr = resolved.version
      ? `${resolved.version.major}.${resolved.version.minor}.${resolved.version.micro}`
      : "";
    const envName =
      resolved.environment?.name ?? path.basename(path.dirname(executablePath));
    const envType = resolved.environment?.type ?? "Unknown";

    return {
      envId: {
        id: resolved.id,
        managerId: `${PYTHON_EXT_ID}:${envType}`,
      },
      name: envName,
      displayName: `Python ${versionStr} (${envName})`,
      displayPath: executablePath,
      version: versionStr,
      environmentPath: resolved.environment?.folderUri,
      execInfo: {
        run: { executable: executablePath },
      },
      sysPrefix: resolved.executable.sysPrefix ?? "",
    };
  }

  // ---------------------------------------------------------------------------
  // Notification
  // ---------------------------------------------------------------------------

  private _showPetWarning(): void {
    if (this._petWarningShown) {
      return;
    }
    this._petWarningShown = true;

    const useEnvsSetting = vscode.workspace
      .getConfiguration("python")
      .get<boolean>("useEnvironmentsExtension");

    vscode.window
      .showWarningMessage(
        "Python environment discovery is degraded (PET binary missing). " +
          "This commonly occurs in OpenVSX-based editors (Dev Spaces, VSCodium)." +
          (useEnvsSetting
            ? " Disabling the Environments extension delegation may resolve hanging discovery."
            : ""),
        ...(useEnvsSetting ? ["Disable Environments Extension"] : []),
        "Learn More",
      )
      .then(async (selection) => {
        if (selection === "Disable Environments Extension") {
          await vscode.workspace
            .getConfiguration("python")
            .update(
              "useEnvironmentsExtension",
              false,
              vscode.ConfigurationTarget.Global,
            );
          const reload = await vscode.window.showInformationMessage(
            "Setting disabled. Reload VS Code for the change to take effect.",
            "Reload Now",
          );
          if (reload === "Reload Now") {
            await vscode.commands.executeCommand(
              "workbench.action.reloadWindow",
            );
          }
        } else if (selection === "Learn More") {
          vscode.env.openExternal(
            vscode.Uri.parse(
              "https://github.com/microsoft/vscode-python/issues/25820",
            ),
          );
        }
      });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public isAvailable(): boolean {
    return this._pythonEnvApi !== undefined || this._pythonExtApi !== undefined;
  }

  /**
   * Whether the full Environments extension API is active (PET working).
   * When false, only the fallback Python extension API is available —
   * createTerminal / managePackages / createEnvironment are not usable.
   */
  public hasFullApi(): boolean {
    return this._pythonEnvApi !== undefined;
  }

  public async getEnvironment(
    scope?: GetEnvironmentScope,
  ): Promise<PythonEnvironment | undefined> {
    await this.initialize();

    // For files outside workspace, use first workspace folder instead
    let resolvedScope = scope;
    if (scope && !vscode.workspace.getWorkspaceFolder(scope)) {
      resolvedScope = vscode.workspace.workspaceFolders?.[0]?.uri;
    } else if (!scope) {
      // No scope provided - default to first workspace folder
      resolvedScope = vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    // Primary: Environments extension
    if (this._pythonEnvApi) {
      try {
        const env = await this._pythonEnvApi.getEnvironment(resolvedScope);
        return env;
      } catch (error) {
        console.error(
          `[Ansible] Error getting environment (envs API): ${error}`,
        );
      }
    }

    // Fallback: Python extension
    if (this._pythonExtApi) {
      try {
        const envPath =
          this._pythonExtApi.environments.getActiveEnvironmentPath(
            resolvedScope,
          );
        const resolved =
          await this._pythonExtApi.environments.resolveEnvironment(envPath);
        if (resolved) {
          const adapted = this._adaptResolvedEnvironment(resolved);
          return adapted;
        }
      } catch (error) {
        console.error(
          `[Ansible] Error getting environment (python ext): ${error}`,
        );
      }
    }

    return undefined;
  }

  public async getEnvironments(
    scope: vscode.Uri | "all" | "global" = "all",
  ): Promise<PythonEnvironment[]> {
    await this.initialize();

    // Primary: Environments extension
    if (this._pythonEnvApi) {
      try {
        return await this._pythonEnvApi.getEnvironments(scope);
      } catch (error) {
        console.error(
          `[Ansible] Error getting environments (envs API): ${error}`,
        );
      }
    }

    // Fallback: Python extension — resolve each known environment sequentially.
    // May be slow for users with many Python installations; consider caching
    // or lazy resolution if this becomes a bottleneck.
    if (this._pythonExtApi) {
      try {
        const results: PythonEnvironment[] = [];
        for (const env of this._pythonExtApi.environments.known) {
          const resolved =
            await this._pythonExtApi.environments.resolveEnvironment(env);
          if (resolved) {
            results.push(this._adaptResolvedEnvironment(resolved));
          }
        }
        return results;
      } catch (error) {
        console.error(
          `[Ansible] Error getting environments (python ext): ${error}`,
        );
      }
    }

    return [];
  }

  public async getExecutablePath(
    scope?: GetEnvironmentScope,
  ): Promise<string | undefined> {
    const env = await this.getEnvironment(scope);
    return env?.execInfo.run.executable;
  }

  /**
   * Resolve Python interpreter path with user configuration fallback.
   * Provides centralized resolution logic used by middleware, webviews, and command runners.
   *
   * Resolution order:
   * 1. User-configured ansible.python.interpreterPath (with ~ and ${workspaceFolder} expansion)
   * 2. Python Environments extension selection
   * 3. ms-python.python extension selection (fallback)
   *
   * @param userConfiguredPath - Value from ansible.python.interpreterPath setting
   * @param scope - Workspace scope for environment resolution
   * @returns Resolved absolute path to Python interpreter, or undefined if none found
   */
  public async resolveInterpreterPath(
    userConfiguredPath: string | undefined,
    scope?: vscode.Uri,
  ): Promise<string | undefined> {
    // Priority 1: User-configured ansible.python.interpreterPath
    if (userConfiguredPath && userConfiguredPath.trim()) {
      const { resolveInterpreterPath } =
        await import("@src/features/utils/interpreterPathResolver");
      const resolved = resolveInterpreterPath(userConfiguredPath, scope);
      if (resolved) {
        return resolved;
      }
    }

    // Priority 2 & 3: Python extension (handled by getEnvironment)
    return await this.getExecutablePath(scope);
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

  /**
   * Get the raw Python Environments API. Returns undefined when only
   * the fallback (ms-python.python) is active.
   */
  public getApi(): PythonEnvironmentApi | undefined {
    return this._pythonEnvApi;
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

    // Fall back to classic Python extension command
    try {
      await vscode.commands.executeCommand("python.setInterpreter");
    } catch {
      vscode.window.showErrorMessage(
        "Unable to open Python environment picker. " +
          "Please ensure a Python extension is installed and enabled.",
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
