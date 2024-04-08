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
  cmdArgs: string,
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
      // if the user provided a path to the executable, we directly execute the app.
      command = `${runExecutable} ${cmdArgs}`;
    }
    // emulating virtual environment activation script
    newEnv["VIRTUAL_ENV"] = virtualEnv;
    newEnv["PATH"] = `${pathEntry}:${process.env.PATH}`;
    delete newEnv.PYTHONHOME;
  }
  return [command, newEnv];
}
