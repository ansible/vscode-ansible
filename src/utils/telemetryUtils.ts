import {
  getRedHatService,
  TelemetryService,
} from "@redhat-developer/vscode-redhat-telemetry/lib";
import { RedHatService } from "@redhat-developer/vscode-redhat-telemetry";

import { ExtensionContext } from "vscode";
import {
  CloseAction,
  CloseHandlerResult,
  ErrorAction,
  ErrorHandler,
  ErrorHandlerResult,
  Message,
} from "vscode-languageclient";
import * as vscode from "vscode";

export const CMD_SUCCEED_VALUE = "succeeded";
const CMD_FAIL_VALUE = "failed";

/**
 * Send a telemetry event related to a given vscode-ansible command
 *
 * @param telemetryService - the telemetry service to use
 * @param isTelemetryInit - whether the telemetry service has been initialized
 * @param eventName - the name of the command that was run
 * @param eventData - the data to be sent with the event
 * @throws if the telemetry service has not been initialized yet
 * @returns when the telemetry event has been sent
 */

export async function sendTelemetry(
  telemetryService: TelemetryService,
  isTelemetryInit: boolean,
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: any,
): Promise<void> {
  if (!telemetryService || !isTelemetryInit) {
    throw new Error("Telemetry has not been initialized yet");
  }
  if (!eventName) {
    throw new Error("Event name is required");
  }
  // TODO: Temporary enable only ansibleMetadata event and pause all the other telemetry,
  //       other events will be enabled in future as per requirements.
  if (eventName !== "ansibleMetadata") {
    return;
  }

  await telemetryService.send({
    name: eventName,
    properties: eventData,
  });
}

export class TelemetryManager {
  private context: ExtensionContext;
  public telemetryService!: TelemetryService;
  public redhatService!: RedHatService;
  public isTelemetryInit = false;

  constructor(context: ExtensionContext) {
    this.context = context;
  }

  public async initTelemetryService(): Promise<void> {
    if (this.isTelemetryInit) {
      throw new Error("Telemetry already initialized");
    }
    this.redhatService = await getRedHatService(this.context);
    this.telemetryService = await this.redhatService.getTelemetryService();
    this.isTelemetryInit = true;
  }
  /**
   * Sends a telemetry event indicating that the given command ran successfully
   *
   * @param commandName - the command that was executed
   * @throws if the telemetry service has not been initialized yet
   * @returns when the telemetry event has been sent
   */
  public async sendCommandSucceededTelemetry(
    commandName: string,
  ): Promise<void> {
    await this.sendCommandTelemetry(commandName, true);
  }

  /**
   * Sends a telemetry event indicating that the given command failed
   *
   * @param commandName - the command that was executed
   * @param msg - the error message
   * @throws if the telemetry service has not been initialized yet
   * @returns when the telemetry event has been sent
   */
  public async sendCommandFailedTelemetry(
    commandName: string,
    msg?: string,
  ): Promise<void> {
    await this.sendCommandTelemetry(commandName, false, msg);
  }

  /**
   * Send a telemetry event related to a given vscode-ansible command
   *
   * @param commandName - the name of the command that was run
   * @throws if the telemetry service has not been initialized yet
   * @returns when the telemetry event has been sent
   */
  public async sendCommandTelemetry(
    commandName: string,
    succeeded: boolean,
    msg?: string,
  ): Promise<void> {
    if (!this.isTelemetryInit) {
      throw new Error("Telemetry has not been initialized yet");
    }

    await sendTelemetry(
      this.telemetryService,
      this.isTelemetryInit,
      commandName,
      {
        status: succeeded ? CMD_SUCCEED_VALUE : CMD_FAIL_VALUE,
        error_message: msg,
      },
    );
  }

  async sendStartupTelemetryEvent(
    isInitialized: boolean,
    errorMessage?: string,
  ): Promise<void> {
    const startUpData: Map<string, string | boolean> = new Map();
    startUpData.set("ansible.server.initialized", isInitialized);
    if (errorMessage) {
      startUpData.set("error", errorMessage);
    }
    await sendTelemetry(
      this.telemetryService,
      this.isTelemetryInit,
      "startup",
      startUpData,
    );
  }
}

/* Referred from  https://github.com/redhat-developer/vscode-yaml/blob/main/src/telemetry.ts
and modified for Ansible extension */
export class TelemetryErrorHandler implements ErrorHandler {
  private restarts: number[] = [];
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly name: string,
    private readonly maxRestartCount: number,
  ) {
    // do nothing
  }

  error(error: Error, message: Message, count: number): ErrorHandlerResult {
    sendTelemetry(this.telemetry, true, "ansible.lsp.error", {
      jsonrpc: message.jsonrpc,
      error: error.message,
    });

    let action: ErrorAction;
    if (count && count <= 3) {
      action = ErrorAction.Continue;
    } else {
      action = ErrorAction.Shutdown;
    }
    const errorResult: ErrorHandlerResult = { action: action };
    return errorResult;
  }

  closed(): CloseHandlerResult {
    let action;
    this.restarts.push(Date.now());
    if (this.restarts.length <= this.maxRestartCount) {
      action = CloseAction.Restart;
    } else {
      const diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
      if (diff <= 3 * 60 * 1000) {
        vscode.window.showErrorMessage(
          `The ${this.name} server crashed ${
            this.maxRestartCount + 1
          } times in the last 3 minutes. The server will not be restarted.`,
        );
        action = CloseAction.DoNotRestart;
      } else {
        this.restarts.shift();
        action = CloseAction.Restart;
      }
    }
    const closedResult: CloseHandlerResult = { action: action };
    return closedResult;
  }
}

const errorMassagesToSkip = [
  { text: "Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED", contains: true },
];

export class TelemetryOutputChannel implements vscode.OutputChannel {
  private errors!: string[];
  private throttleTimeout: vscode.Disposable | undefined;
  constructor(
    private readonly delegate: vscode.OutputChannel,
    private readonly telemetry: TelemetryService,
  ) {
    // do nothing
  }

  get name(): string {
    return this.delegate.name;
  }
  append(value: string): void {
    this.checkError(value);
    this.delegate.append(value);
  }
  appendLine(value: string): void {
    this.checkError(value);
    this.delegate.appendLine(value);
  }
  replace(value: string): void {
    this.checkError(value);
    this.delegate.replace(value);
  }
  private checkError(value: string): void {
    if (value.startsWith("[Error") || value.startsWith("  Message: Request")) {
      if (this.isNeedToSkip(value)) {
        return;
      }
      if (!this.errors) {
        this.errors = [];
      }
      if (this.throttleTimeout) {
        this.throttleTimeout.dispose();
      }
      this.errors.push(value);
      const timeoutHandle = setTimeout(() => {
        sendTelemetry(this.telemetry, true, "ansible.server.error", {
          error: this.createErrorMessage(),
        });
        this.errors = [];
      }, 50);
      this.throttleTimeout = new vscode.Disposable(() =>
        clearTimeout(timeoutHandle),
      );
    }
  }

  private isNeedToSkip(value: string): boolean {
    for (const skip of errorMassagesToSkip) {
      if (skip.contains) {
        if (value.includes(skip.text)) {
          return true;
        }
      } else {
        const starts = value.startsWith(skip.text);
        if (starts) {
          return true;
        }
      }
    }

    return false;
  }

  private createErrorMessage(): string {
    const result = [];
    for (const value of this.errors) {
      if (value.startsWith("[Error")) {
        result.push(
          value.substring(value.indexOf("]") + 1, value.length).trim(),
        );
      } else {
        result.push(value);
      }
    }

    return result.join("\n");
  }

  clear(): void {
    this.delegate.clear();
  }
  show(preserveFocus?: boolean): void;
  show(column?: vscode.ViewColumn, preserveFocus?: boolean): void;
  show(column?: never, preserveFocus?: boolean): void {
    this.delegate.show(preserveFocus);
  }
  hide(): void {
    this.delegate.hide();
  }
  dispose(): void {
    this.delegate.dispose();
  }
}
