/**
 * Terminal Service
 * 
 * Central dispatcher for terminal operations with Python venv support.
 * Handles waiting for Python extension activation before sending commands.
 */

import * as vscode from 'vscode';
import type { PythonEnvironmentApi } from '@ansible/core';

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

export class TerminalService {
    private static _instance: TerminalService;
    private _disposables: vscode.Disposable[] = [];
    private _pythonEnvApi: PythonEnvironmentApi | undefined;
    private _initialized: boolean = false;

    private constructor() {}

    public static getInstance(): TerminalService {
        if (!TerminalService._instance) {
            TerminalService._instance = new TerminalService();
        }
        return TerminalService._instance;
    }

    /**
     * Initialize the service with Python extension API
     */
    public async initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }

        const pythonExt = vscode.extensions.getExtension<PythonEnvironmentApi>(
            'ms-python.vscode-python-envs'
        );

        if (pythonExt) {
            if (!pythonExt.isActive) {
                await pythonExt.activate();
            }
            this._pythonEnvApi = pythonExt.exports;
        }

        this._initialized = true;
    }

    /**
     * Create a terminal with Python venv activated, waiting for activation to complete
     */
    public async createActivatedTerminal(options: CreateTerminalOptions): Promise<ManagedTerminal> {
        await this.initialize();

        const workspaceFolder = options.cwd || vscode.workspace.workspaceFolders?.[0]?.uri;
        const showTerminal = options.show !== false;
        const activationTimeout = options.activationTimeout || 10000;

        let terminal: vscode.Terminal;
        let expectActivation = false;

        // Try to create terminal with Python environment
        if (this._pythonEnvApi && workspaceFolder) {
            const environment = await this._pythonEnvApi.getEnvironment(workspaceFolder);
            
            if (environment) {
                terminal = await this._pythonEnvApi.createTerminal(environment, {
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

        // Wait for process ID to be assigned
        await terminal.processId;

        // If we expect Python activation, wait for it
        if (expectActivation) {
            await this._waitForActivation(terminal, activationTimeout);
        } else {
            // Just wait for shell to be ready
            await this._waitForShellReady(terminal, activationTimeout);
        }

        // Create managed terminal wrapper
        const disposables: vscode.Disposable[] = [];

        const sendCommand = async (
            command: string, 
            cmdOptions?: SendCommandOptions
        ): Promise<CommandResult> => {
            const timeout = cmdOptions?.timeout || 300000; // 5 minutes default
            const waitForCompletion = cmdOptions?.waitForCompletion !== false;

            if (!waitForCompletion) {
                terminal.sendText(command);
                return { output: '', exitCode: undefined, success: true };
            }

            return this._sendAndCapture(terminal, command, timeout);
        };

        const dispose = () => {
            disposables.forEach(d => d.dispose());
            terminal.dispose();
        };

        return { terminal, sendCommand, dispose };
    }

    /**
     * Wait for Python venv activation to complete
     */
    private async _waitForActivation(
        terminal: vscode.Terminal, 
        timeout: number
    ): Promise<void> {
        // Try using Python extension's activation state API if available
        if (this._pythonEnvApi?.onDidChangeTerminalActivationState) {
            return new Promise(resolve => {
                const listener = this._pythonEnvApi!.onDidChangeTerminalActivationState!((event) => {
                    if (event.terminal === terminal && event.activated) {
                        listener.dispose();
                        resolve();
                    }
                });

                // Timeout fallback
                setTimeout(() => {
                    listener.dispose();
                    resolve();
                }, timeout);
            });
        }

        // Fallback: Simple delay to allow Python extension to activate
        // The Python extension typically activates within 2-3 seconds
        await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 3000)));
    }

    /**
     * Wait for shell to be ready (no Python activation expected)
     */
    private async _waitForShellReady(
        _terminal: vscode.Terminal, 
        timeout: number
    ): Promise<void> {
        // Simple delay to allow shell to initialize
        await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 1000)));
    }

    /**
     * Send a command and capture its output
     * Note: Output capture is not available without proposed APIs
     * This method just sends the command and waits for timeout
     */
    private async _sendAndCapture(
        terminal: vscode.Terminal,
        command: string,
        timeout: number
    ): Promise<CommandResult> {
        // Without onDidWriteTerminalData API, we can't capture output
        // Just send the command and use shell integration for exit code if available
        terminal.sendText(command);

        // Try shell integration for exit code
        const shellIntegration = (terminal as { shellIntegration?: { onDidEndCommandExecution?: (cb: (e: { exitCode: number | undefined }) => void) => { dispose(): void } } }).shellIntegration;
        
        if (shellIntegration?.onDidEndCommandExecution) {
            return new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    listener.dispose();
                    resolve({ output: '', exitCode: undefined, success: false });
                }, timeout);

                const listener = shellIntegration.onDidEndCommandExecution!((e: { exitCode: number | undefined }) => {
                    clearTimeout(timeoutId);
                    listener.dispose();
                    resolve({
                        output: '', // Can't capture without proposed API
                        exitCode: e.exitCode,
                        success: e.exitCode === 0
                    });
                });
            });
        }

        // No shell integration - can't determine completion
        // Return immediately, command runs in background
        return { output: '', exitCode: undefined, success: true };
    }

    /**
     * Simple fire-and-forget command to a new terminal
     */
    public async runInTerminal(
        name: string,
        command: string,
        options?: { show?: boolean; cwd?: vscode.Uri }
    ): Promise<vscode.Terminal> {
        const managed = await this.createActivatedTerminal({
            name,
            cwd: options?.cwd,
            show: options?.show,
        });

        managed.sendCommand(command, { waitForCompletion: false });
        return managed.terminal;
    }

    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
