import * as child_process from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import * as path from "path";

export async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}

export const asyncExec = promisify(child_process.exec);

export function toLspRange(
  range: [number, number],
  textDocument: TextDocument
): Range {
  const start = textDocument.positionAt(range[0]);
  const end = textDocument.positionAt(range[1]);
  return Range.create(start, end);
}

export function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is X & Record<Y, unknown> {
  return isObject(obj) && obj.hasOwnProperty(prop);
}

/**
 * Checks whether `obj` is a non-null object.
 */
export function isObject<X>(obj: X): obj is X & Record<PropertyKey, unknown> {
  return obj && typeof obj === "object";
}

export function insert(str: string, index: number, val: string): string {
  return `${str.substring(0, index)}${val}${str.substring(index)}`;
}

/**
 * Adjusts the command and environment in case the interpreter path is provided.
 */
export function withInterpreter(
  executable: string,
  args: string,
  interpreterPath: string,
  activationScript: string
): [string, NodeJS.ProcessEnv | undefined] {
  let command = `${executable} ${args}`; // base case

  const newEnv = Object.assign({}, process.env, {
    ANSIBLE_FORCE_COLOR: "0", // ensure output is parseable (no ANSI)
  });

  if (activationScript) {
    command = `bash -c 'source ${activationScript} && ${executable} ${args}'`;
    return [command, undefined];
  }

  if (interpreterPath) {
    const virtualEnv = path.resolve(interpreterPath, "../..");

    const pathEntry = path.join(virtualEnv, "bin");
    if (path.isAbsolute(executable)) {
      // if both interpreter path and absolute command path are provided, we can
      // bolster the chances of success by letting the interpreter execute the
      // command
      command = `${interpreterPath} ${executable} ${args}`;
    }

    // emulating virtual environment activation script
    newEnv["VIRTUAL_ENV"] = virtualEnv;
    newEnv["PATH"] = `${pathEntry}:${process.env.PATH}`;
    delete newEnv.PYTHONHOME;
  }
  return [command, newEnv];
}

/**
 * Returns errors messages when LS is run on unsupported platform, or undefined
 * when all is fine.
 */
export function getUnsupportedError(): string | undefined {
  // win32 applies to x64 arch too, is the platform name
  if (process.platform === "win32") {
    return "Ansible Language Server can only run inside WSL on Windows. Refer to vscode documentation for more details.";
  }
}
