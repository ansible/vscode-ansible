import * as cp from "child_process";
import * as os from "os";
import { SettingsManager } from "@src/settings";
import { withInterpreter } from "@src/features/utils/commandRunner";
import { ANSIBLE_CREATOR_VERSION_MIN } from "@src/definitions/constants";
import { isAnsibleCreatorVersionGte } from "@src/features/contentCreator/ansibleCreatorVersion";

export async function getBinDetail(cmd: string, arg: string) {
  const extSettings = new SettingsManager();
  await extSettings.initialize();

  const { command, env } = await withInterpreter(
    extSettings.settings,
    cmd,
    arg,
  );

  try {
    const result = cp.execSync(command, {
      env: env,
    });
    return result;
  } catch (error) {
    console.error(
      `[Ansible] Failed to run "${command}":`,
      error instanceof Error ? error.message : error,
    );
    return "failed";
  }
}

export async function getCreatorVersion(): Promise<string> {
  const creatorVersion = (await getBinDetail("ansible-creator", "--version"))
    .toString()
    .trimEnd();
  console.log("ansible-creator version: ", creatorVersion);
  return creatorVersion;
}

function formatExecFailure(error: unknown): string {
  if (error instanceof Error) {
    const execError = error as cp.ExecException & {
      stdout: string;
      stderr: string;
    };

    let errorMessage = execError.stdout ? execError.stdout : execError.stderr;
    errorMessage += execError.message;
    return errorMessage;
  }
  return `Exception: ${JSON.stringify(error)}`;
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
    return { output: formatExecFailure(error), status: "failed" };
  }
}

export async function runCommandArgv(
  executable: string,
  args: string[],
  runEnv: NodeJS.ProcessEnv | undefined,
  cwd?: string,
): Promise<{ output: string; status: string }> {
  try {
    const result = cp
      .execFileSync(executable, args, {
        env: runEnv,
        cwd: cwd ?? os.homedir(),
      })
      .toString();
    return { output: result, status: "passed" };
  } catch (error) {
    return { output: formatExecFailure(error), status: "failed" };
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

export async function getADEVersion(): Promise<string> {
  const adeVersion = (await getBinDetail("ade", "--version"))
    .toString()
    .trimEnd();
  console.log("ade version: ", adeVersion);
  return adeVersion;
}

export async function checkContentCreatorRequirements() {
  const failures = [];
  let creatorVersion: string;
  try {
    creatorVersion = await getCreatorVersion();

    if (creatorVersion === "failed") {
      failures.push({
        type: "ansible-creator",
        required: ANSIBLE_CREATOR_VERSION_MIN,
        current: "not found",
      });
    } else if (
      !isAnsibleCreatorVersionGte(creatorVersion, ANSIBLE_CREATOR_VERSION_MIN)
    ) {
      failures.push({
        type: "ansible-creator",
        required: ANSIBLE_CREATOR_VERSION_MIN,
        current: creatorVersion,
      });
    }
  } catch (error) {
    console.error(
      "[Ansible] ansible-creator requirements check error:",
      error instanceof Error ? error.message : error,
    );
    failures.push({
      type: "ansible-creator",
      required: ANSIBLE_CREATOR_VERSION_MIN,
      current: "not found",
    });
  }
  return {
    met: failures.length === 0,
    failures,
  };
}
