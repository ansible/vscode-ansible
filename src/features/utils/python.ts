/* credits: https://github.com/microsoft/vscode-python-tools-extension-template/blob/main/src/common/python.ts */

import { extensions } from "vscode";

export interface IInterpreterDetails {
  path?: string;
  environment?: string;
  version?: string;
}

/** Activate python extension */
export async function activatePythonExtension() {
  const extension = extensions.getExtension("ms-python.python");
  if (extension) {
    if (!extension.isActive) {
      await extension.activate();
    }
  }
  return extension;
}

/** Get python interpreter details */
export async function getInterpreterDetails(): Promise<IInterpreterDetails> {
  const pythonExtension = await activatePythonExtension();
  if (pythonExtension !== undefined) {
    const exports = await pythonExtension.exports;

    if (exports !== undefined) {
      const environment = await exports?.environments.resolveEnvironment(
        exports?.environments.getActiveEnvironmentPath(),
      );

      if (environment?.executable.uri) {
        return {
          path: environment?.executable.uri.fsPath,
          environment: environment.environment?.name,
          version: `${environment.version.major}.${environment.version.minor}.${environment.version.micro}`,
        };
      }
    }
  }
  return {
    path: undefined,
    environment: undefined,
    version: undefined,
  };
}
