/**
 * Terminal Service
 *
 * Central dispatcher for terminal operations with Python venv support.
 * Delegates environment resolution to PythonEnvironmentService so that
 * PET detection and fallback logic are handled in one place.
 */

import * as path from "path";
import * as vscode from "vscode";
import { TerminalActivationStateEventArgs } from "@src/types/pythonEnvApi";
import { PythonEnvironmentService } from "@src/services/PythonEnvironmentService";

interface CommandResult {
  output: string;
  exitCode: number | undefined;
  success: boolean;
}

interface ManagedTerminal {
  terminal: vscode.Terminal;
  sendCommand: (
    command: string,
    options?: SendCommandOptions,
  ) => Promise<CommandResult>;
  dispose: () => void;
}

interface SendCommandOptions {
  /** Timeout in ms (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Whether to wait for command completion (default: true) */
  waitForCompletion?: boolean;
}

interface CreateTerminalOptions {
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

  // eslint-disable-next-line no-empty-function
  private constructor() {}

  public static getInstance(): TerminalService {
    if (!TerminalService._instance) {
      TerminalService._instance = new TerminalService();
    }
    return TerminalService._instance;
  }

  /**
   * Create a terminal with Python venv activated, waiting for activation to complete
   */
  public async createActivatedTerminal(
    options: CreateTerminalOptions,
  ): Promise<ManagedTerminal> {
    const pyEnvService = PythonEnvironmentService.getInstance();
    await pyEnvService.initialize();

    const workspaceFolder =
      options.cwd || vscode.workspace.workspaceFolders?.[0]?.uri;
    const showTerminal = options.show !== false;
    const activationTimeout = options.activationTimeout || 10000;

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

    const envsApi = pyEnvService.getApi();

    // Full Environments API available (PET working) — use its createTerminal
    if (envsApi && workspaceFolder) {
      const environment = await pyEnvService.getEnvironment(workspaceFolder);

      if (environment) {
        try {
          terminal = await envsApi.createTerminal(environment, {
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
      // Fallback path: resolve executable from PythonEnvironmentService and
      // inject it into PATH / VIRTUAL_ENV manually.
      const environment = await pyEnvService.getEnvironment(
        workspaceFolder ?? undefined,
      );
      const execPath = environment?.execInfo?.run?.executable;

      const envVars: NodeJS.ProcessEnv = { ...options.env };
      if (execPath) {
        const binDir = path.dirname(execPath);
        const existingPath = envVars["PATH"] ?? process.env["PATH"] ?? "";
        envVars["PATH"] = `${binDir}${path.delimiter}${existingPath}`;
        if (environment?.environmentPath) {
          const envPath = environment.environmentPath;
          if (envPath instanceof vscode.Uri) {
            envVars["VIRTUAL_ENV"] = envPath.fsPath;
          } else if (typeof envPath === "string") {
            envVars["VIRTUAL_ENV"] = envPath;
          }
        }
      }

      terminal = vscode.window.createTerminal({
        name: options.name,
        cwd: workspaceFolder,
        env: envVars,
      });

      // Fallback: source the activation script from settings when the
      // Python Environments extension is not available.
      try {
        const ansibleConfig = vscode.workspace.getConfiguration(
          "ansible",
          workspaceFolder,
        );
        const activationScript = ansibleConfig?.get<string>(
          "python.activationScript",
        );
        if (activationScript && activationScript.trim()) {
          terminal.sendText(`source ${activationScript}`);
          console.log(
            `[Ansible] Terminal Service: sourced activation script: ${activationScript}`,
          );
        }
      } catch {
        // Configuration access may fail in some environments
      }
    }

    if (showTerminal) {
      terminal.show();
    }

    await terminal.processId;

    if (expectActivation) {
      await this._waitForActivation(terminal, activationTimeout);
    } else {
      await this._waitForShellReady(activationTimeout);
    }

    return this._wrapTerminal(terminal);
  }

  private _wrapTerminal(terminal: vscode.Terminal): ManagedTerminal {
    const sendCommand = async (
      command: string,
      cmdOptions?: SendCommandOptions,
    ): Promise<CommandResult> => {
      const timeout = cmdOptions?.timeout || 300000;
      const waitForCompletion = cmdOptions?.waitForCompletion !== false;

      if (!waitForCompletion) {
        terminal.sendText(command);
        return { output: "", exitCode: undefined, success: true };
      }

      return this._sendAndCapture(terminal, command, timeout);
    };

    const dispose = () => {
      terminal.dispose();
    };

    return { terminal, sendCommand, dispose };
  }

  /**
   * Wait for Python venv activation to complete using the Environments
   * extension's activation state API when available.
   */
  private async _waitForActivation(
    terminal: vscode.Terminal,
    timeout: number,
  ): Promise<void> {
    const envsApi = PythonEnvironmentService.getInstance().getApi();
    const activationStateEvent = envsApi?.onDidChangeTerminalActivationState;

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

        setTimeout(() => {
          listener.dispose();
          resolve();
        }, timeout);
      });
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(timeout, 3000)),
    );
  }

  private async _waitForShellReady(timeout: number): Promise<void> {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(timeout, 1000)),
    );
  }

  private async _sendAndCapture(
    terminal: vscode.Terminal,
    command: string,
    timeout: number,
  ): Promise<CommandResult> {
    terminal.sendText(command);

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
            output: "",
            exitCode: e.exitCode,
            success: e.exitCode === 0,
          });
        });
      });
    }

    return { output: "", exitCode: undefined, success: true };
  }

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
    this._disposables.forEach((d) => {
      d.dispose();
    });
    this._disposables = [];
  }
}
