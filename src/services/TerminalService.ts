/**
 * Terminal Service
 *
 * Central dispatcher for terminal operations with Python venv support.
 * Delegates Python environment resolution to PythonEnvironmentService.
 */

import * as vscode from 'vscode';
import type { PythonEnvironmentService } from '@src/services/PythonEnvironmentService';

export interface CommandResult {
    output: string;
    exitCode: number | undefined;
    success: boolean;
}

export interface ManagedTerminal {
    terminal: vscode.Terminal;
    sendCommand: (command: string, options?: SendCommandOptions) => Promise<CommandResult>;
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
}

/** Central dispatcher for terminal operations with Python venv support. */
export class TerminalService {
    private static _instance: TerminalService | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _pythonEnvService: PythonEnvironmentService | undefined;

    /** Private constructor for the singleton terminal service. */
    private constructor() {
        /* singleton */
    }

    /**
     * Return the shared terminal service instance.
     * @returns Singleton TerminalService instance
     */
    public static getInstance(): TerminalService {
        TerminalService._instance ??= new TerminalService();
        return TerminalService._instance;
    }

    /**
     * Inject the centralized Python environment service.
     * @param service - Service used to create activated Python terminals
     */
    public setPythonEnvService(service: PythonEnvironmentService): void {
        this._pythonEnvService = service;
    }

    /**
     * Create a terminal with Python venv activated, waiting for activation to complete
     * @param options - Terminal name, cwd, visibility, and activation timeout
     * @returns Managed terminal with helpers to send commands and dispose resources
     */
    public async createActivatedTerminal(options: CreateTerminalOptions): Promise<ManagedTerminal> {
        const workspaceFolder = options.cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri;
        const showTerminal = options.show !== false;
        const activationTimeout = options.activationTimeout ?? 10000;

        let terminal: vscode.Terminal;
        let expectActivation = false;

        if (this._pythonEnvService?.hasEnvsExtension() && workspaceFolder) {
            const environment = await this._pythonEnvService.getEnvironment(workspaceFolder);

            if (environment) {
                terminal = await this._pythonEnvService.createTerminal(environment, {
                    name: options.name,
                    cwd: workspaceFolder,
                });
                expectActivation = true;
            } else {
                terminal = vscode.window.createTerminal({
                    name: options.name,
                    cwd: workspaceFolder,
                });
            }
        } else {
            terminal = vscode.window.createTerminal({
                name: options.name,
                cwd: workspaceFolder,
            });
        }

        if (showTerminal) {
            terminal.show();
        }

        await terminal.processId;

        if (expectActivation) {
            await this._waitForActivation(terminal, activationTimeout);
        } else {
            await this._waitForShellReady(terminal, activationTimeout);
        }

        const disposables: vscode.Disposable[] = [];

        const sendCommand = async (
            command: string,
            cmdOptions?: SendCommandOptions,
        ): Promise<CommandResult> => {
            const timeout = cmdOptions?.timeout ?? 300000;
            const waitForCompletion = cmdOptions?.waitForCompletion !== false;

            if (!waitForCompletion) {
                terminal.sendText(command);
                return { output: '', exitCode: undefined, success: true };
            }

            return this._sendAndCapture(terminal, command, timeout);
        };

        const dispose = () => {
            for (const d of disposables) {
                d.dispose();
            }
            terminal.dispose();
        };

        return { terminal, sendCommand, dispose };
    }

    /**
     * Wait until Python environment activation completes for a terminal.
     * @param terminal - Terminal whose activation state should be observed
     * @param timeout - Maximum time to wait for activation in milliseconds
     */
    private async _waitForActivation(terminal: vscode.Terminal, timeout: number): Promise<void> {
        const activationEvent = this._pythonEnvService?.onDidChangeTerminalActivationState;
        if (activationEvent) {
            return new Promise((resolve) => {
                const listener = activationEvent((event) => {
                    if (event.terminal === terminal && event.activated) {
                        listener.dispose();
                        resolve();
                    }
                });

                setTimeout(() => {
                    listener.dispose();
                    resolve();
                }, timeout);
            });
        }

        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 3000)));
    }

    /**
     * Wait briefly for a plain terminal shell to become ready.
     * @param _terminal - Terminal being prepared, unused because no activation event exists
     * @param timeout - Upper bound used to derive the readiness delay
     */
    private async _waitForShellReady(_terminal: vscode.Terminal, timeout: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 1000)));
    }

    /**
     * Send a command to a terminal and wait for shell integration completion.
     * @param terminal - Terminal that should execute the command
     * @param command - Shell command to send
     * @param timeout - Maximum time to wait for completion in milliseconds
     * @returns Captured exit status when shell integration is available
     */
    private async _sendAndCapture(
        terminal: vscode.Terminal,
        command: string,
        timeout: number,
    ): Promise<CommandResult> {
        interface ShellIntegrationTerminal {
            shellIntegration?: {
                onDidEndCommandExecution?: (cb: (e: { exitCode: number | undefined }) => void) => {
                    dispose(): void;
                };
            };
        }

        const getShellIntegration = () =>
            (terminal as ShellIntegrationTerminal).shellIntegration?.onDidEndCommandExecution;

        let onDidEnd = getShellIntegration();

        if (!onDidEnd) {
            const ready = await new Promise<boolean>((resolve) => {
                const d = vscode.window.onDidChangeTerminalShellIntegration((e) => {
                    if (e.terminal === terminal) {
                        d.dispose();
                        resolve(true);
                    }
                });
                setTimeout(() => {
                    d.dispose();
                    resolve(false);
                }, 5000);
            });
            if (ready) {
                onDidEnd = getShellIntegration();
            }
        }

        if (onDidEnd) {
            const endListener = onDidEnd;
            return new Promise((resolve) => {
                const timeoutId = setTimeout(() => {
                    listener.dispose();
                    resolve({ output: '', exitCode: undefined, success: false });
                }, timeout);

                const listener = endListener((e: { exitCode: number | undefined }) => {
                    clearTimeout(timeoutId);
                    listener.dispose();
                    resolve({
                        output: '',
                        exitCode: e.exitCode,
                        success: e.exitCode === 0,
                    });
                });

                terminal.sendText(command);
            });
        }

        terminal.sendText(command);
        return { output: '', exitCode: undefined, success: true };
    }

    /**
     * Create an activated terminal and run a command without waiting for output.
     * @param name - Terminal display name
     * @param command - Shell command to execute
     * @param options - Optional terminal creation settings
     * @param options.show - Whether to reveal the terminal after creation
     * @param options.cwd - Working directory for the terminal session
     * @returns The underlying VS Code terminal instance
     */
    public async runInTerminal(
        name: string,
        command: string,
        options?: { show?: boolean; cwd?: vscode.Uri },
    ): Promise<vscode.Terminal> {
        const managed = await this.createActivatedTerminal({
            name,
            cwd: options?.cwd,
            show: options?.show,
        });

        void managed.sendCommand(command, { waitForCompletion: false });
        return managed.terminal;
    }

    /** Dispose registered terminal service listeners. */
    public dispose(): void {
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}
