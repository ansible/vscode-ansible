// This file is loaded automatically by mocha during the test run.
import { isWindows, console } from "./helper";
import { execSync, spawnSync, SpawnSyncOptions } from "child_process";
import pkg from "../../../package.json";

// Error code returned if we cannot even start testing:
const PRETEST_ERR_RC = 2;
const SKIP_PODMAN = (process.env.SKIP_PODMAN ?? "0") === "1";
const SKIP_DOCKER = (process.env.SKIP_DOCKER ?? "0") === "1";
let EE_VERSION = "N/A";
const DEFAULT_CONTAINER =
  pkg?.contributes?.configuration[6]?.properties[
    "ansible.executionEnvironment.image"
  ]?.default ?? "";

if (DEFAULT_CONTAINER === "") {
  console.error(
    "ERROR: Failed to read default container value from extension package.json file.",
  );
  process.exit(PRETEST_ERR_RC);
}

// isWindows returns false under WSL
if (isWindows()) {
  console.error(
    "ERROR: This project does not support pure Windows, try under WSL2.",
  );
  process.exit(PRETEST_ERR_RC);
}

function exec(cmd: string[], options: SpawnSyncOptions = {}) {
  options.stdio = "inherit";
  console.info(`Execute: ${cmd.join(" ")}`);
  spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
  });
}

// We don't require colors in the stdout of the command results.
process.env["NO_COLOR"] = "1";

const command = "ansible-lint --version";
const env = process.env;

try {
  const result = execSync(command, { env: env });
  console.info(`Detected: ${result}`);
} catch (e) {
  console.error(`error: test requisites not met, '${command}' returned ${e}`);
  process.exit(PRETEST_ERR_RC);
}

try {
  const result = execSync("./tools/get-image-version", { env: env });
  console.info(`EE_VERSION: ${result}`);
  EE_VERSION = result.toString();
} catch (e) {
  console.error(`error: test requisites not met, '${command}' returned ${e}`);
  process.exit(PRETEST_ERR_RC);
}

const containers = new Set([
  `ghcr.io/ansible/community-ansible-dev-tools:${EE_VERSION}`,
  DEFAULT_CONTAINER,
]);

interface EnginesMap {
  [key: string]: boolean;
}
const enginesMap: EnginesMap = {
  podman: SKIP_PODMAN,
  docker: SKIP_DOCKER,
};
for (const container_name of containers) {
  for (const engine in enginesMap) {
    const engine_skip = enginesMap[engine];
    if (!engine_skip) {
      exec([engine, "pull", "-q", container_name]);
      exec([
        engine,
        "run",
        "-i",
        "--rm",
        container_name,
        "ansible-lint",
        "--version",
      ]);
    }
  }
}
