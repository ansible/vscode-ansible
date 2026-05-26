import * as path from "path";
import { promises as fs } from "fs";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";

export async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}

export function toLspRange(
  range: [number, number],
  textDocument: TextDocument,
): Range {
  const start = textDocument.positionAt(range[0]);
  const end = textDocument.positionAt(range[1]);
  return Range.create(start, end);
}

export function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, prop);
}

export function isObject<X>(obj: X): obj is X & Record<PropertyKey, unknown> {
  return obj !== null && obj !== undefined && typeof obj === "object";
}

export function insert(str: string, index: number, val: string): string {
  return `${str.substring(0, index)}${val}${str.substring(index)}`;
}

/**
 * Adjusts the command and environment for a Python virtual-environment.
 */
export function withInterpreter(
  executable: string,
  args: string,
  interpreterPath: string,
  activationScript: string,
): { command: string; env: NodeJS.ProcessEnv } {
  let command = `${executable} ${args}`;

  const newEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
    ANSIBLE_FORCE_COLOR: "0",
    PYTHONBREAKPOINT: "0",
  };

  if (activationScript) {
    command = `sh -c '. ${activationScript} && ${executable} ${args}'`;
    return { command, env: newEnv };
  }

  if (interpreterPath) {
    const virtualEnv = path.resolve(interpreterPath, "../..");
    const pathEntry = path.join(virtualEnv, "bin");

    if (path.isAbsolute(executable)) {
      command = `${executable} ${args}`;
    }

    newEnv["VIRTUAL_ENV"] = virtualEnv;
    newEnv["PATH"] = `${pathEntry}:${process.env.PATH}`;
    delete newEnv.PYTHONHOME;
  }

  return { command, env: newEnv };
}

/**
 * Returns an error message when the LS runs on an unsupported platform.
 */
export function getUnsupportedError(): string | undefined {
  if (process.platform === "win32") {
    return "Ansible Language Server can only run inside WSL on Windows.";
  }
}
