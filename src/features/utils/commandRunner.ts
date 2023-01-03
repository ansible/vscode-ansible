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
    command = `bash -c 'source ${activationScript} && ${runExecutable} ${cmdArgs}'`;
    return [command, undefined];
  }

  const interpreterPath = settings.interpreterPath;
  if (interpreterPath && interpreterPath !== "") {
    const virtualEnv = path.resolve(interpreterPath, "../..");

    const pathEntry = path.join(virtualEnv, "bin");
    if (path.isAbsolute(runExecutable)) {
      // if both interpreter path and absolute command path are provided, we can
      // bolster the chances of success by letting the interpreter execute the
      // command
      command = `${interpreterPath} ${runExecutable} ${cmdArgs}`;
    }
    // emulating virtual environment activation script
    newEnv["VIRTUAL_ENV"] = virtualEnv;
    newEnv["PATH"] = `${pathEntry}:${process.env.PATH}`;
    delete newEnv.PYTHONHOME;
  }
  return [command, newEnv];
}
