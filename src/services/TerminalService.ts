/**
 * Terminal Service
 *
 * Central dispatcher for terminal operations with Python venv support.
 * Handles waiting for Python extension activation before sending commands.
 * Uses the Python Environments extension for automatic terminal activation.
 */

import * as vscode from "vscode";
import {
  PythonEnvironmentApi,
  TerminalActivationStateEventArgs,
  PYTHON_ENVS_EXTENSION_ID,
} from "../types/pythonEnvApi";

export interface CommandResult {
  output: string;
  exitCode: number | undefined;
  success: boolean;
}

export interface ManagedTerminal {
  terminal: vscode.Terminal;
  sendCommand: (
    command: string,
    options?: SendCommandOptions,
  ) => Promise<CommandResult>;
  dispose: () => void;
}

export interface SendCommandOptions {
  /** Timeout in ms (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Whether to wait for command completion (default: true) */
  waitForCompletion?: boolean;
}

export interface CreateTerminalOptions {
  name: string;
  cwd?: vscode.Uri;
  /** Whether to show the terminal (default: true) */
  show?: boolean;
  /** Timeout for activation wait in ms (default: 10000) */
  activationTimeout?: number;
  /** Additional environment variables to set */
  env?: NodeJS.ProcessEnv;
  /** Whether to reuse an existing terminal with the same name */
  reuseExisting?: boolean;
}

export class TerminalService implements vscode.Disposable {
  private static _instance: TerminalService | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _pythonEnvApi: PythonEnvironmentApi | undefined;
  private _initialized: boolean = false;

  // eslint-disable-next-line no-empty-function
  private constructor() {}

  /**
   * Get the singleton instance of TerminalService
   */
  public static getInstance(): TerminalService {
    if (!TerminalService._instance) {
      TerminalService._instance = new TerminalService();
    }
    return TerminalService._instance;
  }

  /**
   * Initialize the service with Python Environments extension API
   */
  public async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    const pythonExt = vscode.extensions.getExtension<PythonEnvironmentApi>(
      PYTHON_ENVS_EXTENSION_ID,
    );

    if (pythonExt) {
      try {
        if (!pythonExt.isActive) {
          await pythonExt.activate();
        }
        const exports = pythonExt.exports;
        if (exports && typeof exports.createTerminal === "function") {
          this._pythonEnvApi = exports;
          console.log(
            "[Ansible] Terminal Service: Python Environment API initialized",
          );
        } else {
          console.warn(
            "[Ansible] Terminal Service: Python Environments API not available (enable python.useEnvironmentsExtension)",
          );
        }
      } catch (error) {
        console.warn(
          `[Ansible] Terminal Service: Failed to activate Python extension: ${error}`,
        );
      }
    }

    this._initialized = true;
  }

  /**
   * Check if the Python Environments extension API is available
   */
  public isAvailable(): boolean {
    return this._pythonEnvApi !== undefined;
  }

  /**
   * Create a terminal with Python venv activated, waiting for activation to complete
   */
  public async createActivatedTerminal(
    options: CreateTerminalOptions,
  ): Promise<ManagedTerminal> {
    await this.initialize();

    const workspaceFolder =
      options.cwd || vscode.workspace.workspaceFolders?.[0]?.uri;
    const showTerminal = options.show !== false;
    const activationTimeout = options.activationTimeout || 10000;

    // Check for existing terminal to reuse
    if (options.reuseExisting) {
      const existingTerminal = vscode.window.terminals.find(
        (terminal) => terminal.name === options.name,
      );
      if (existingTerminal) {
        if (showTerminal) {
          existingTerminal.show();
        }
        return this._wrapTerminal(existingTerminal);
      }
    }

    let terminal: vscode.Terminal;
    let expectActivation = false;

    // Try to create terminal with Python environment using the Python Environments API
    if (this._pythonEnvApi && workspaceFolder) {
      const environment =
        await this._pythonEnvApi.getEnvironment(workspaceFolder);

      if (environment) {
        try {
          // Use Python Environments extension to create an activated terminal
          terminal = await this._pythonEnvApi.createTerminal(environment, {
            name: options.name,
            cwd: workspaceFolder,
            env: options.env,
          });
          expectActivation = true;
          console.log(
            `[Ansible] Created activated terminal with environment: ${environment.displayName}`,
          );
        } catch (error) {
          console.warn(
            `[Ansible] Terminal Service: Failed to create Python-activated terminal: ${error}`,
          );
          terminal = vscode.window.createTerminal({
            name: options.name,
            cwd: workspaceFolder,
            env: options.env,
          });
        }
      } else {
        terminal = vscode.window.createTerminal({
          name: options.name,
          cwd: workspaceFolder,
          env: options.env,
        });
      }
    } else {
      terminal = vscode.window.createTerminal({
        name: options.name,
        cwd: workspaceFolder,
        env: options.env,
      });
    }

    if (showTerminal) {
      terminal.show();
    }

    // Wait for process ID to be assigned
    await terminal.processId;

    // If we expect Python activation, wait for it
    if (expectActivation) {
      await this._waitForActivation(terminal, activationTimeout);
    } else {
      // Just wait for shell to be ready
      await this._waitForShellReady(activationTimeout);
    }

    return this._wrapTerminal(terminal);
  }

  /**
   * Create a managed terminal wrapper
   */
  private _wrapTerminal(terminal: vscode.Terminal): ManagedTerminal {
    const disposables: vscode.Disposable[] = [];

    const sendCommand = async (
      command: string,
      cmdOptions?: SendCommandOptions,
    ): Promise<CommandResult> => {
      const timeout = cmdOptions?.timeout || 300000; // 5 minutes default
      const waitForCompletion = cmdOptions?.waitForCompletion !== false;

      if (!waitForCompletion) {
        terminal.sendText(command);
        return { output: "", exitCode: undefined, success: true };
      }

      return this._sendAndCapture(terminal, command, timeout);
    };

    const dispose = () => {
      disposables.forEach((d) => d.dispose());
      terminal.dispose();
    };

    return { terminal, sendCommand, dispose };
  }

  /**
   * Wait for Python venv activation to complete
   */
  private async _waitForActivation(
    terminal: vscode.Terminal,
    timeout: number,
  ): Promise<void> {
    // Try using Python extension's activation state API if available
    const activationStateEvent =
      this._pythonEnvApi?.onDidChangeTerminalActivationState;
    if (activationStateEvent) {
      return new Promise((resolve) => {
        const listener = activationStateEvent(
          (event: TerminalActivationStateEventArgs) => {
            if (event.terminal === terminal && event.activated) {
              listener.dispose();
              resolve();
            }
          },
        );

        // Timeout fallback
        setTimeout(() => {
          listener.dispose();
          resolve();
        }, timeout);
      });
    }

    // Fallback: Simple delay to allow Python extension to activate
    // The Python extension typically activates within 2-3 seconds
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(timeout, 3000)),
    );
  }

  /**
   * Wait for shell to be ready (no Python activation expected)
   */
  private async _waitForShellReady(timeout: number): Promise<void> {
    // Simple delay to allow shell to initialize
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(timeout, 1000)),
    );
  }

  /**
   * Send a command and capture its output
   * Note: Output capture is not available without proposed APIs
   * This method just sends the command and waits for timeout
   */
  private async _sendAndCapture(
    terminal: vscode.Terminal,
    command: string,
    timeout: number,
  ): Promise<CommandResult> {
    // Without onDidWriteTerminalData API, we can't capture output
    // Just send the command and use shell integration for exit code if available
    terminal.sendText(command);

    // Try shell integration for exit code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shellIntegration = (terminal as any).shellIntegration;

    if (shellIntegration?.onDidEndCommandExecution) {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          listener.dispose();
          resolve({ output: "", exitCode: undefined, success: false });
        }, timeout);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listener = shellIntegration.onDidEndCommandExecution((e: any) => {
          clearTimeout(timeoutId);
          listener.dispose();
          resolve({
            output: "", // Can't capture without proposed API
            exitCode: e.exitCode,
            success: e.exitCode === 0,
          });
        });
      });
    }

    // No shell integration - can't determine completion
    // Return immediately, command runs in background
    return { output: "", exitCode: undefined, success: true };
  }

  /**
   * Simple fire-and-forget command to a new terminal
   */
  public async runInTerminal(
    name: string,
    command: string,
    options?: { show?: boolean; cwd?: vscode.Uri; env?: NodeJS.ProcessEnv },
  ): Promise<vscode.Terminal> {
    const managed = await this.createActivatedTerminal({
      name,
      cwd: options?.cwd,
      show: options?.show,
      env: options?.env,
    });

    managed.sendCommand(command, { waitForCompletion: false });
    return managed.terminal;
  }

  /**
   * Get or create a reusable terminal with Python activation
   */
  public async getOrCreateTerminal(
    name: string,
    options?: {
      cwd?: vscode.Uri;
      show?: boolean;
      env?: NodeJS.ProcessEnv;
    },
  ): Promise<ManagedTerminal> {
    return this.createActivatedTerminal({
      name,
      cwd: options?.cwd,
      show: options?.show,
      env: options?.env,
      reuseExisting: true,
    });
  }

  public dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}
