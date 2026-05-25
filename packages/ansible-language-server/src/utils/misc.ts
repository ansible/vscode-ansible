import * as child_process from "child_process";
import { existsSync, statSync, promises as fs } from "node:fs";
import { promisify } from "util";
import type { SpawnOptions } from "child_process";
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

// eslint-disable-next-line no-control-regex
const SHELL_METACHARACTERS = /[\x00\n\r$`;&|(){}<>!']/;

export function validatePlaybookPath(fsPath: string): string | undefined {
  if (SHELL_METACHARACTERS.test(fsPath)) {
    return `Playbook path contains potentially unsafe characters: ${fsPath}`;
  }
  if (!existsSync(fsPath)) {
    return `Playbook file does not exist: ${fsPath}`;
  }
  return undefined;
}

function validateActivationScript(scriptPath: string): string | undefined {
  if (SHELL_METACHARACTERS.test(scriptPath)) {
    return `Activation script path contains potentially unsafe characters: ${scriptPath}`;
  }
  try {
    if (!statSync(scriptPath).isFile()) {
      return `Activation script path is not a file: ${scriptPath}`;
    }
  } catch {
    return `Activation script does not exist: ${scriptPath}`;
  }
  return undefined;
}

export type SpawnResult = { stdout: string; stderr: string };

export function spawnSyncWithResult(
  command: string,
  args: string[],
  options: child_process.SpawnSyncOptions = {},
): SpawnResult {
  const result = child_process.spawnSync(command, args, {
    encoding: "utf-8",
    shell: false,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const message =
      (result.stderr?.toString() || result.stdout?.toString() || "").trim() ||
      `Process '${command}' exited with code ${result.status}`;
    throw new Error(message);
  }
  return {
    stdout: (result.stdout ?? "").toString(),
    stderr: (result.stderr ?? "").toString(),
  };
}

export function asyncSpawn(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(command, args, {
      ...options,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const message =
        stderr.trim() ||
        stdout.trim() ||
        `Process '${command}' exited with code ${code}`;
      const error = new Error(message) as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      error.code = code ?? undefined;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
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
    const validationError = validateActivationScript(activationScript);
    if (!validationError) {
      command = `sh -c '. ${activationScript} && ${executable} ${args}'`;
      return { command: command, env: process.env };
    } else {
      console.debug(validationError);
    }
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
