/**
 * Type definitions for the Microsoft Python Environments extension API
 * Based on: https://github.com/microsoft/vscode-python-environments/blob/main/src/api.ts
 */

import * as vscode from 'vscode';

export interface PythonEnvironmentId {
    id: string;
    managerId: string;
}

export interface PythonCommandRunConfiguration {
    executable: string;
    args?: string[];
}

export interface PythonEnvironmentExecutionInfo {
    run: PythonCommandRunConfiguration;
    activatedRun?: PythonCommandRunConfiguration;
    activation?: PythonCommandRunConfiguration[];
}

export interface PythonEnvironment {
    readonly envId: PythonEnvironmentId;
    readonly name: string;
    readonly displayName: string;
    readonly displayPath: string;
    readonly version: string;
    readonly environmentPath: vscode.Uri;
    readonly description?: string;
    readonly execInfo: PythonEnvironmentExecutionInfo;
    readonly sysPrefix: string;
}

export interface PackageManagementOptions {
    upgrade?: boolean;
    showSkipOption?: boolean;
    install?: string[];
    uninstall?: string[];
}

export interface PythonTerminalExecutionOptions {
    cwd: string | vscode.Uri;
    args?: string[];
    show?: boolean;
}

export interface CreateEnvironmentOptions {
    quickCreate?: boolean;
    additionalPackages?: string[];
}

export type GetEnvironmentScope = undefined | vscode.Uri;
export type SetEnvironmentScope = undefined | vscode.Uri | vscode.Uri[];

export interface DidChangeEnvironmentEventArgs {
    uri?: vscode.Uri;
    old?: PythonEnvironment;
    new?: PythonEnvironment;
}

export interface TerminalActivationStateEventArgs {
    terminal: vscode.Terminal;
    activated: boolean;
}

/**
 * The main API exported by ms-python.vscode-python-envs
 */
export interface PythonEnvironmentApi {
    // Environment Management
    getEnvironment(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined>;
    setEnvironment(scope: SetEnvironmentScope, environment?: PythonEnvironment): Promise<void>;
    getEnvironments(scope: vscode.Uri | 'all' | 'global'): Promise<PythonEnvironment[]>;
    createEnvironment(scope: vscode.Uri | vscode.Uri[] | 'global', options?: CreateEnvironmentOptions): Promise<PythonEnvironment | undefined>;
    
    // Package Management
    managePackages(environment: PythonEnvironment, options: PackageManagementOptions): Promise<void>;
    
    // Terminal/Execution
    runInTerminal(environment: PythonEnvironment, options: PythonTerminalExecutionOptions): Promise<vscode.Terminal>;
    createTerminal(environment: PythonEnvironment, options: vscode.TerminalOptions): Promise<vscode.Terminal>;
    
    // Events
    onDidChangeEnvironment?: vscode.Event<DidChangeEnvironmentEventArgs>;
    onDidChangeTerminalActivationState?: vscode.Event<TerminalActivationStateEventArgs>;
}
