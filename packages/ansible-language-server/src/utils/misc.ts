import * as child_process from "child_process";
import { existsSync, promises as fs } from "node:fs";
import { promisify } from "util";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Range } from "vscode-languageserver-types";
import * as path from "path";

export async function fileExists(filePath: string): Promise<boolean> {
  return !!(await fs.stat(filePath).catch(() => false));
}

/** Thin wrapper so tests can override venv detection without mocking Node builtins. */
function isVenvDirectory(binDir: string): boolean {
  return existsSync(path.join(binDir, "activate"));
}

export const asyncExec = promisify(child_process.exec);

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
  activationScript: string,
  _isVenvDirectory: (binDir: string) => boolean = isVenvDirectory,
): { command: string; env: NodeJS.ProcessEnv } {
  let command = `${executable} ${args}`; // base case

  const newEnv = Object.assign({}, process.env, {
    NO_COLOR: "1", // ensure none of the output produce color characters
    ANSIBLE_FORCE_COLOR: "0", // ensure output is parsable (no ANSI)
    PYTHONBREAKPOINT: "0", // We want to be sure that python debugger is never
    // triggered, even if we mistakenly left a breakpoint() there while
    // debugging ansible- lint, or another tool we call.
  });

  if (activationScript) {
    command = `sh -c '. ${activationScript} && ${executable} ${args}'`;
    return { command: command, env: process.env };
  }

  if (interpreterPath) {
    // Bare command (e.g. "python3") — clear stale venv vars, nothing to prepend
    if (path.basename(interpreterPath) === interpreterPath) {
      delete newEnv.VIRTUAL_ENV;
      return { command: command, env: newEnv };
    }

    const resolvedPath = path.resolve(interpreterPath);
    const interpreterDir = path.dirname(resolvedPath);
    const potentialVirtualEnv = path.resolve(interpreterDir, "..");
    const potentialBinDir = path.join(potentialVirtualEnv, "bin");

    const isVirtualEnv = _isVenvDirectory(potentialBinDir);

    const pathEntry = isVirtualEnv ? potentialBinDir : interpreterDir;

    if (path.isAbsolute(executable)) {
      command = `${executable} ${args}`;
    }

    if (isVirtualEnv) {
      newEnv["VIRTUAL_ENV"] = potentialVirtualEnv;
      delete newEnv.PYTHONHOME;
    } else {
      delete newEnv.VIRTUAL_ENV;
    }
    newEnv["PATH"] = `${pathEntry}:${process.env.PATH}`;
  }
  return { command: command, env: newEnv };
}

/**
 * Returns errors messages when LS is run on unsupported platform, or undefined
 * when all is fine.
 */
export function getUnsupportedError(): string | undefined {
  // win32 applies to x64 arch too, is the platform name
  /* v8 ignore start */
  if (process.platform === "win32") {
    return "Ansible Language Server can only run inside WSL on Windows. Refer to vscode documentation for more details.";
  }
  /* v8 ignore end */
}
