/**
 * Terminal Service
 * 
 * Central dispatcher for terminal operations with Python venv support.
 * Delegates Python environment resolution to PythonEnvironmentService.
 */

import * as vscode from 'vscode';
import type { PythonEnvironmentService } from './PythonEnvironmentService';

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
    private _pythonEnvService: PythonEnvironmentService | undefined;

    private constructor() {}

    public static getInstance(): TerminalService {
        if (!TerminalService._instance) {
            TerminalService._instance = new TerminalService();
        }
        return TerminalService._instance;
    }

    /**
     * Inject the centralized Python environment service.
     */
    public setPythonEnvService(service: PythonEnvironmentService): void {
        this._pythonEnvService = service;
    }

    /**
     * Create a terminal with Python venv activated, waiting for activation to complete
     */
    public async createActivatedTerminal(options: CreateTerminalOptions): Promise<ManagedTerminal> {
        const workspaceFolder = options.cwd || vscode.workspace.workspaceFolders?.[0]?.uri;
        const showTerminal = options.show !== false;
        const activationTimeout = options.activationTimeout || 10000;

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
            cmdOptions?: SendCommandOptions
        ): Promise<CommandResult> => {
            const timeout = cmdOptions?.timeout || 300000;
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

    private async _waitForActivation(
        terminal: vscode.Terminal, 
        timeout: number
    ): Promise<void> {
        const activationEvent = this._pythonEnvService?.onDidChangeTerminalActivationState;
        if (activationEvent) {
            return new Promise(resolve => {
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

        await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 3000)));
    }

    private async _waitForShellReady(
        _terminal: vscode.Terminal, 
        timeout: number
    ): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 1000)));
    }

    private async _sendAndCapture(
        terminal: vscode.Terminal,
        command: string,
        timeout: number
    ): Promise<CommandResult> {
        terminal.sendText(command);

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
                        output: '',
                        exitCode: e.exitCode,
                        success: e.exitCode === 0
                    });
                });
            });
        }

        return { output: '', exitCode: undefined, success: true };
    }

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
