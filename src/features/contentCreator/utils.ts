import * as cp from "child_process";
import * as os from "os";
import { SettingsManager } from "../../settings";
import { withInterpreter } from "../utils/commandRunner";

export async function getBinDetail(cmd: string, arg: string) {
  const extSettings = new SettingsManager();
  await extSettings.initialize();

  const [command, runEnv] = withInterpreter(extSettings.settings, cmd, arg);

  try {
    const result = cp.execSync(command, {
      env: runEnv,
    });
    return result;
  } catch {
    return "failed";
  }
}

export async function runCommand(
  command: string,
  runEnv: NodeJS.ProcessEnv | undefined,
): Promise<{ output: string; status: string }> {
  const extSettings = new SettingsManager();
  await extSettings.initialize();

  try {
    const result = cp
      .execSync(command, {
        env: runEnv,
        cwd: os.homedir(),
      })
      .toString();
    return { output: result, status: "passed" };
  } catch (error) {
    let errorMessage: string;
    if (error instanceof Error) {
      const execError = error as cp.ExecException & {
        // according to the docs, these are always available
        stdout: string;
        stderr: string;
      };

      errorMessage = execError.stdout ? execError.stdout : execError.stderr;
      errorMessage += execError.message;
    } else {
      errorMessage = `Exception: ${JSON.stringify(error)}`;
    }
    return { output: errorMessage, status: "failed" };
  }
}

/**
 * A function to expand the path similar to how os.expanduser() and os.expandvars() work in python
 * @param pathUrl - original path url (string)
 * @returns updatedUrl - updated and expanded path url (string)
 */
export function expandPath(pathUrl: string): string {
  let updatedUrl = pathUrl;

  // expand `~` to home directory.
  const re1 = /~/gi;
  updatedUrl = updatedUrl.replace(re1, os.homedir());

  // expand `$HOME` to home directory
  const re2 = /\$HOME/gi;
  updatedUrl = updatedUrl.replace(re2, os.homedir());

  return updatedUrl;
}
