/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

export class Log {
  private output: vscode.LogOutputChannel;

  constructor() {
    this.output = vscode.window.createOutputChannel("Ansible Lightspeed", {
      log: true,
    });
  }

  public trace(message: string): void {
    this.output.trace(message);
  }

  public info(message: string): void {
    this.output.info(message);
  }

  public error(message: string): void {
    this.output.error(message);
  }

  public debug(message: string): void {
    this.output.debug(message);
  }

  public warn(message: string): void {
    this.output.warn(message);
  }
}

// Singleton instance for all Lightspeed features to share the same output channel
let lightspeedLoggerInstance: Log | null = null;

export function getLightspeedLogger(): Log {
  if (!lightspeedLoggerInstance) {
    lightspeedLoggerInstance = new Log();
  }
  return lightspeedLoggerInstance;
}
