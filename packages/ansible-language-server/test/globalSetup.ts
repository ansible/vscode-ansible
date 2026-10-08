// Global setup that runs once before all tests
import { isWindows, console } from "@test/helper.js";
import { spawn, spawnSync, SpawnSyncOptions } from "child_process";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { quote } from "shell-quote";

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(import.meta.dirname, "..", "..", "..");
// Resolve root package.json (vitest als project root is packages/ansible-language-server)
const pkg = require(path.join(REPO_ROOT, "package.json"));

function readDefaultEeImageTag(): string {
  const configPaths = [
    path.join(REPO_ROOT, ".config", "Containerfile"),
    path.join(REPO_ROOT, ".config", "Dockerfile"),
    path.join(
      REPO_ROOT,
      "packages",
      "ansible-language-server",
      ".config",
      "Dockerfile",
    ),
  ];
  let version = "latest";
  for (const configPath of configPaths) {
    let text: string;
    try {
      text = fs.readFileSync(configPath, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("FROM")) {
        const colon = line.indexOf(":");
        if (colon !== -1) {
          version = line.slice(colon + 1);
          const space = version.indexOf(" ");
          if (space !== -1) {
            version = version.slice(0, space);
          }
        }
        return version;
      }
    }
  }
  return version;
}

const SKIP_PODMAN = (process.env.SKIP_PODMAN ?? "0") === "1";
const SKIP_DOCKER = (process.env.SKIP_DOCKER ?? "0") === "1";
let EE_VERSION = "N/A";
const DEFAULT_CONTAINER: string =
  (pkg.contributes.configuration[6]?.properties[
    "ansible.executionEnvironment.image"
  ]?.default as string | undefined) ?? "";

function exec(cmd: string[], options: SpawnSyncOptions = {}) {
  options.stdio = "inherit";
  console.info(`Execute: ${cmd.join(" ")}`);
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const message = `${cmd.join(" ")} failed with exit code ${result.status ?? "unknown"}`;
    if (process.env.CI === "true") {
      throw new Error(message);
    }
    console.warn(`Warning: ${message}`);
  }
}

function execWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number = 5000,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cmd = quote([command, ...args]);
    const proc = spawn(cmd, {
      shell: true, // keep it
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
  if (process.env._ALS_ORIGINAL_HOME) {
    process.env.HOME = process.env._ALS_ORIGINAL_HOME;
    process.env.USERPROFILE = process.env._ALS_ORIGINAL_HOME;
  }

  // Isolate ANSIBLE_HOME and XDG_CACHE_HOME to prevent writes to ~/.ansible/
  // and ~/.cache/ansible-language-server/ respectively.
  const ansibleHome = path.resolve(
    import.meta.dirname,
    "../../../out/.ansible",
  );
  const cacheHome = path.resolve(import.meta.dirname, "../../../out/.cache");
  fs.mkdirSync(ansibleHome, { recursive: true });
  fs.mkdirSync(cacheHome, { recursive: true });
  process.env.ANSIBLE_HOME = ansibleHome;
  process.env.XDG_CACHE_HOME = cacheHome;

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

  // ALWAYS use 'shell: true' when we execute external commands inside the
  // extension because some of the tools may be installed in a way that does
  // not make them available without a shell, common examples tools that may
  // do this are: mise, asdf, pyenv.
  const command = "ansible-lint";
  const args = ["--nocolor", "--version", "--offline"];
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

  EE_VERSION = readDefaultEeImageTag();
  console.info(`EE_VERSION: ${EE_VERSION}`);
  if (EE_VERSION === "latest" && process.env.CI === "true") {
    console.warn(
      "Warning: EE image tag resolved to 'latest'; pin a tag in .config/Containerfile if tests become flaky.",
    );
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
}
