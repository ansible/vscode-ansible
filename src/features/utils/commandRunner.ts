/* stdlib */
import * as path from "path";

/* local */
import { ExtensionSettings } from "../../interfaces/extensionSettings";

/**
 * A helper method to get interpreter path related settings to
 * while running the command.
 * @param settings - The extension setting.
 * @param runExecutable - The name of the executable to run.
 * @param runArgs - The arguments to the executable.
 * @returns The complete command to be executed.
 */
export function withInterpreter(
  settings: ExtensionSettings,
  runExecutable: string,
  cmdArgs: string
): [string, NodeJS.ProcessEnv | undefined] {
  let command = `${runExecutable} ${cmdArgs}`; // base case

  const newEnv = Object.assign({}, process.env, {
    ANSIBLE_FORCE_COLOR: "0", // ensure output is parseable (no ANSI)
    PYTHONBREAKPOINT: "0", // We want to be sure that python debugger is never
    // triggered, even if we mistakenly left a breakpoint() there while
    // debugging ansible- lint, or another tool we call.
  });

  const activationScript = settings.activationScript;
  if (activationScript) {
    const [command, shellArgs] = wrapWithActivationScript(
      activationScript,
      runExecutable,
      cmdArgs
    );
    return [`${command} ${shellArgs.join(" ")}`, undefined];
  }

  const interpreterPath = settings.interpreterPath;
  if (interpreterPath && interpreterPath !== "") {
    if (path.isAbsolute(runExecutable)) {
      // if the user provided a path to the executable, we directly execute the app.
      command = `${runExecutable} ${cmdArgs}`;
    }

    // emulating virtual environment activation script
    const venvVars = buildPythonVirtualEnvVars(interpreterPath);
    for (const key in venvVars) {
      newEnv[key] = venvVars[key];
    }
    delete newEnv.PYTHONHOME;
  }
  return [command, newEnv];
}

/**
 * Builds the command, args, and env vars needed to run a Python module.
 * @param settings - The extension settings.
 * @param module - The python module to invoke.
 * @param moduleArgs - The arguments to invoke with the module.
 * @returns The executable, arguments, and environment variables to run.
 */
export function withPythonModule(
  settings: ExtensionSettings,
  module: string,
  moduleArgs: string[]
): [string, string[], { [key: string]: string }] {
  let command: string = "python";

  let commandArgs: string[] = ["-m", module];
  commandArgs.push(...moduleArgs);

  const newEnv: { [key: string]: string } = {};
  for (const e in process.env) {
    newEnv[e] = process.env[e] ?? "";
  }

  const activationScript = settings.activationScript;
  const interpreterPath = settings.interpreterPath;
  if (activationScript) {
    [command, commandArgs] = wrapWithActivationScript(
      activationScript,
      command,
      commandArgs.join(" ")
    );
  } else if (interpreterPath) {
    const venvVars = buildPythonVirtualEnvVars(interpreterPath);
    for (const key in venvVars) {
      newEnv[key] = venvVars[key];
    }
    delete newEnv.PYTHONHOME;

    command = interpreterPath;
  }

  return [command, commandArgs, newEnv];
}

/**
 * A helper method to wrap the executable in the bash compatible
 * activation script.
 * @param activationScript - The activation script to run before the command.
 * @param executable - The executable to run with the activation script.
 * @param cmdArgs - The command args to run with the activation script.
 * @returns The wrapped command and args with the activation script.
 */
function wrapWithActivationScript(
  activationScript: string,
  executable: string,
  cmdArgs: string
): [string, string[]] {
  return [
    "bash",
    ["-c", `source ${activationScript} && ${executable} ${cmdArgs}`],
  ];
}

/**
 * A helper method to build the env vars needed to run in a Python virtual
 * environment.
 * @param interpreterPath - The Python interpreter path.
 * @returns The env vars that need to be set to run in the venv.
 */
function buildPythonVirtualEnvVars(interpreterPath: string): {
  [key: string]: string;
} {
  const virtualEnv = path.resolve(interpreterPath, "../..");
  const pathEntry = path.join(virtualEnv, "bin");

  return {
    VIRTUAL_ENV: virtualEnv,
    PATH: `${pathEntry}${path.delimiter}${process.env.PATH}`,
  };
}
