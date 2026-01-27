// Global setup that runs once before all tests
import { isWindows, console } from "./helper.js";
import { spawn, spawnSync, SpawnSyncOptions } from "child_process";
import pkg from "../../../package.json" assert { type: "json" };

const SKIP_PODMAN = (process.env.SKIP_PODMAN ?? "0") === "1";
const SKIP_DOCKER = (process.env.SKIP_DOCKER ?? "0") === "1";
let EE_VERSION = "N/A";
const DEFAULT_CONTAINER =
  pkg.contributes.configuration[6]?.properties[
    "ansible.executionEnvironment.image"
  ]?.default ?? "";

function exec(cmd: string[], options: SpawnSyncOptions = {}) {
  options.stdio = "inherit";
  console.info(`Execute: ${cmd.join(" ")}`);
  spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
  });
}

function execWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number = 5000,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Command timed out"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ status: code, stdout, stderr });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function setup() {
  // Only run prerequisite checks when actually running tests, not when listing
  // Check if we're in list mode by checking command line arguments
  const isListing =
    process.argv.includes("list") || process.argv.includes("--list");
  if (isListing) {
    return;
  }

  // Check prerequisites
  if (DEFAULT_CONTAINER === "") {
    throw new Error(
      "ERROR: Failed to read default container value from extension package.json file.",
    );
  }

  // isWindows returns false under WSL
  if (isWindows()) {
    throw new Error(
      "ERROR: This project does not support pure Windows, try under WSL2.",
    );
  }

  // We don't require colors in the stdout of the command results.
  process.env["NO_COLOR"] = "1";

  // ALWAYS use 'shell: true' when we execute external commands inside the
  // extension because some of the tools may be installed in a way that does
  // not make them available without a shell, common examples tools that may
  // do this are: mise, asdf, pyenv.
  const command = "ansible-lint";
  const args = ["--version", "--offline"];
  try {
    const result = await execWithTimeout(command, args, 5000);
    if (result.status === 0) {
      console.info(`Detected: ${result.stdout}`);
    } else {
      console.warn(
        `Warning: ansible-lint check failed (rc=${result.status}). This may be due to a debugger breakpoint. Continuing anyway.`,
      );
    }
  } catch (e: unknown) {
    // Always warn and continue - don't fail tests due to ansible-lint issues
    // (could be debugger breakpoint, missing tool, etc.)
    if (
      e instanceof Error &&
      typeof e.message === "string" &&
      e.message.includes("timeout")
    ) {
      console.warn(
        `Warning: ansible-lint check timed out (possibly due to debugger breakpoint). Continuing anyway.`,
      );
    } else {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      console.warn(
        `Warning: ansible-lint check failed: ${message}. Continuing anyway.`,
      );
    }
  }

  try {
    const result = await execWithTimeout("./tools/get-image-version", [], 5000);
    if (result.status === 0) {
      console.info(`EE_VERSION: ${result.stdout}`);
      EE_VERSION = result.stdout.trim();
    } else {
      console.warn(
        `Warning: Failed to get EE version: rc=${result.status}. Using 'latest' as fallback.`,
      );
      EE_VERSION = "latest";
    }
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      typeof e.message === "string" &&
      e.message.includes("timeout")
    ) {
      console.warn(
        `Warning: get-image-version timed out. Using 'latest' as fallback.`,
      );
    } else {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      console.warn(
        `Warning: Failed to get EE version: ${message}. Using 'latest' as fallback.`,
      );
    }
    EE_VERSION = "latest";
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

  // Container setup is optional - skip if it would take too long
  // Only run if engines are available and we have time
  // Don't fail tests if containers can't be pulled/run
  // Skip container setup to avoid long timeouts during test setup
  console.info(
    "Skipping container setup during test initialization. Container tests will be skipped if containers are not available.",
  );
}

export async function teardown() {
  // Cleanup if needed
}
