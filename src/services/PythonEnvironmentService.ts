/**
 * Python Environment Service
 *
 * Provides a wrapper around the Microsoft Python Environments extension API.
 * Handles initialization, environment retrieval, and event propagation.
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

    const pythonEnvExt = vscode.extensions.getExtension<PythonEnvironmentApi>(
      PYTHON_ENVS_EXTENSION_ID,
    );

    if (pythonEnvExt) {
      try {
        if (!pythonEnvExt.isActive) {
          await pythonEnvExt.activate();
        }
        this._pythonEnvApi = pythonEnvExt.exports;

        // Subscribe to environment change events if available
        if (this._pythonEnvApi?.onDidChangeEnvironment) {
          const listener = this._pythonEnvApi.onDidChangeEnvironment(
            (event) => {
              this._onDidChangeEnvironment.fire(event);
            },
          );
          this._disposables.push(listener);
        }

        console.log("Python Environment Service initialized successfully");
      } catch (error) {
        console.error(
          `Failed to activate Python Environments extension: ${error}`,
        );
      }
    } else {
      console.warn(
        `Python Environments extension (${PYTHON_ENVS_EXTENSION_ID}) is not installed. ` +
          "Some features may be limited.",
      );
    }

    this._initialized = true;
    return this._pythonEnvApi !== undefined;
  }

  /**
   * Check if the Python Environments extension is available
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
      console.error(`Error getting Python environment: ${error}`);
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
      console.error(`Error getting Python environments: ${error}`);
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
          "Install it for better Python environment management.",
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
   * Open the Python environment picker from the Python extension
   */
  public async selectEnvironment(): Promise<void> {
    // Try the new Python Environments extension command first
    try {
      await vscode.commands.executeCommand("python-envs.set");
    } catch {
      // Fall back to the classic Python extension command
      try {
        await vscode.commands.executeCommand("python.setInterpreter");
      } catch (error) {
        console.error(`Error opening Python environment picker: ${error}`);
        vscode.window.showErrorMessage(
          "Unable to open Python environment picker. " +
            "Please ensure a Python extension is installed.",
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
