import * as chai from "chai";
import { ConsoleOutput } from "./consoleOutput";
import { skipEE, console, deleteAlsCache } from "./helper";
import { beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { isWindows } from "./helper";
import { execSync, spawnSync, SpawnSyncOptions } from "child_process";
import pkg from "../../../package.json";

chai.config.truncateThreshold = 0; // disable truncating

const consoleOutput = new ConsoleOutput();

beforeAll(() => {
  deleteAlsCache();
});

beforeEach((testInfo) => {
  // Check if test name or suite name includes @ee
  const testName = testInfo.task.name || "";
  const suiteName = testInfo.task.suite?.name || "";
  const fullTestPath = `${suiteName} ${testName}`;

  if (skipEE() && fullTestPath.includes("@ee")) {
    console.warn(
      `Skipped test due to environment conditions: ${fullTestPath}`,
    );
    testInfo.skip();
  } else {
    consoleOutput.capture();
  }
});

afterEach((testInfo) => {
  // Check if test name or suite name includes @ee
  const testName = testInfo.task.name || "";
  const suiteName = testInfo.task.suite?.name || "";
  const fullTestPath = `${suiteName} ${testName}`;

  if (!(skipEE() && fullTestPath.includes("@ee"))) {
    // Only show console output if test failed
    const testState = testInfo.task.result?.state;
    if (testState !== "pass") {
      consoleOutput.release();
    } else {
      // For passed tests, restore console methods without outputting captured content
      const output = consoleOutput as any;
      if (output.originalConsoleLog) {
        console.log = output.originalConsoleLog;
        console.debug = output.originalConsoleDebug;
        console.info = output.originalConsoleInfo;
        console.warn = output.originalConsoleWarn;
        console.error = output.originalConsoleError;
      }
    }
  }
});

afterAll(() => {
  deleteAlsCache();
});

// Error code returned if we cannot even start testing:
const PRETEST_ERR_RC = 2;
const SKIP_PODMAN = (process.env.SKIP_PODMAN ?? "0") === "1";
const SKIP_DOCKER = (process.env.SKIP_DOCKER ?? "0") === "1";
let EE_VERSION = "N/A";
const DEFAULT_CONTAINER =
  pkg.contributes.configuration[6]?.properties[
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
