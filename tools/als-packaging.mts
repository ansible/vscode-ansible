/**
 * Shared checks for packaged Ansible Language Server (ALS) layout in dist/ and VSIX.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Paths under the extension root (VSIX `extension/` directory). */
export const ALS_DIST_REL = join("packages", "ansible-language-server", "dist");

const REQUIRED_DIST_FILES = ["cli.cjs", "server.cjs"] as const;

const ROLLDOWN_RUNTIME_PATTERN = /^rolldown-runtime-.+\.cjs$/;

export function listAlsDistBasenames(distDir: string): string[] {
  if (!existsSync(distDir)) {
    return [];
  }
  return readdirSync(distDir).filter((name) => {
    const full = join(distDir, name);
    return statSync(full).isFile();
  });
}

/**
 * Assert production ALS dist contains entrypoints and bundler runtime chunks.
 */
export function assertAlsDistComplete(distDir: string): void {
  if (!existsSync(distDir)) {
    throw new Error(`ALS dist directory missing: ${distDir}`);
  }

  const files = listAlsDistBasenames(distDir);
  const missing = REQUIRED_DIST_FILES.filter((f) => !files.includes(f));
  if (missing.length > 0) {
    throw new Error(
      `ALS dist incomplete (missing ${missing.join(", ")}). Found: ${files.join(", ")}`,
    );
  }

  const hasRuntime = files.some((f) => ROLLDOWN_RUNTIME_PATTERN.test(f));
  if (!hasRuntime) {
    throw new Error(
      `ALS dist missing rolldown-runtime-*.cjs chunk (stub-only packaging?)`,
    );
  }

  for (const file of REQUIRED_DIST_FILES) {
    const size = statSync(join(distDir, file)).size;
    if (size === 0) {
      throw new Error(`ALS dist file is empty: ${file}`);
    }
  }

  const cliSource = readFileSync(join(distDir, "cli.cjs"), "utf8").slice(
    0,
    4096,
  );
  if (!cliSource.includes("server.cjs")) {
    throw new Error(
      "cli.cjs does not reference server.cjs — unexpected ALS bundle layout",
    );
  }
}

export function findSingleVsix(outDir: string): string {
  const entries = readdirSync(outDir).filter(
    (name) => name.startsWith("ansible-") && name.endsWith(".vsix"),
  );
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one ansible-*.vsix in ${outDir}, found: ${entries.join(", ") || "(none)"}`,
    );
  }
  const vsixName = entries.at(0);
  if (vsixName === undefined) {
    throw new Error(`Expected one VSIX in ${outDir}`);
  }
  return join(outDir, vsixName);
}

/**
 * Extract a VSIX (zip) and return the `extension/` root inside it.
 */
export function extractVsixExtensionRoot(vsixPath: string): {
  extensionRoot: string;
  cleanup: () => void;
} {
  const extractDir = mkdtempSync(join(tmpdir(), "als-vsix-"));
  execFileSync("unzip", ["-q", vsixPath, "-d", extractDir]);
  const extensionRoot = join(extractDir, "extension");
  if (!existsSync(extensionRoot)) {
    rmSync(extractDir, { force: true, recursive: true });
    throw new Error(`VSIX ${vsixPath} has no extension/ directory after unzip`);
  }
  return {
    cleanup: () => rmSync(extractDir, { force: true, recursive: true }),
    extensionRoot,
  };
}

export function assertAlsDistInExtensionRoot(extensionRoot: string): void {
  assertAlsDistComplete(join(extensionRoot, ALS_DIST_REL));
}

const MODULE_NOT_FOUND = "MODULE_NOT_FOUND";

/**
 * Start packaged ALS CLI with --stdio; fail on missing modules, resolve once the
 * server begins listening (or after a short grace period without errors).
 */
export function smokeAlsCli(
  cliPath: string,
  cwd: string,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "--stdio"], {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(new Error(message));
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve();
    };

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes(MODULE_NOT_FOUND)) {
        fail(`ALS CLI stderr contains ${MODULE_NOT_FOUND}: ${stderr}`);
      }
    });

    child.on("error", (err) => {
      fail(`Failed to spawn ALS CLI: ${String(err)}`);
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      if (stderr.includes(MODULE_NOT_FOUND)) {
        fail(`ALS CLI exited with missing module: ${stderr}`);
        return;
      }
      if (code !== null && code !== 0) {
        fail(
          `ALS CLI exited with code ${code} (signal ${signal ?? "none"}): ${stderr}`,
        );
        return;
      }
      succeed();
    });

    const timer = setTimeout(() => {
      if (stderr.includes(MODULE_NOT_FOUND)) {
        fail(`ALS CLI stderr contains ${MODULE_NOT_FOUND}: ${stderr}`);
        return;
      }
      succeed();
    }, timeoutMs);
  });
}
