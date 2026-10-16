/**
 * Shared checks for packaged Ansible Language Server (ALS) layout in dist/ and VSIX.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

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

const PACKAGED_VSIX_PATTERN = /^ansible-\d.*\.vsix$/;

export function findSingleVsix(outDir: string): string {
  const entries = readdirSync(outDir).filter((name) =>
    PACKAGED_VSIX_PATTERN.test(name),
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

/** Timeout for the LSP initialize handshake — bundles must load within this. */
export const DEFAULT_SMOKE_TIMEOUT_MS =
  process.env.CI === "true" ? 5000 : 10000;

const LSP_INITIALIZE_ID = 1;

/** Build a JSON-RPC Content-Length frame. */
function lspFrame(body: string): string {
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

/**
 * Start packaged `cli.cjs --stdio`, send an LSP `initialize` request, and
 * require a valid JSON-RPC response with server capabilities before passing.
 *
 * Fails on:
 * - `MODULE_NOT_FOUND` in stderr (broken bundle)
 * - Non-zero exit code or unexpected signal
 * - Exit before the LSP response (even with code 0)
 * - Timeout without a response (bundles did not load in time)
 */
export function smokeAlsCli(
  cliPath: string,
  _cwd: string,
  timeoutMs = DEFAULT_SMOKE_TIMEOUT_MS,
): Promise<void> {
  const distDir = realpathSync(dirname(cliPath));
  const cliName = basename(cliPath);
  return new Promise((resolve, reject) => {
    // Use a basename argv[1] + realpath cwd so cli.cjs isDirectRun matches on macOS.
    const child = spawn(process.execPath, [cliName, "--stdio"], {
      cwd: distDir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let stdoutBuf = Buffer.alloc(0);
    let settled = false;

    const dispose = () => {
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
      child.stdin.removeAllListeners("error");
      child.removeAllListeners("error");
      child.removeAllListeners("exit");
      child.stdin?.end();
      child.stdout?.destroy();
      child.stderr?.destroy();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      dispose();
      child.kill("SIGKILL");
      reject(new Error(message));
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      dispose();
      child.kill("SIGTERM");
      resolve();
    };

    // --- Byte-accurate LSP frame parser -----------------------------------
    const HEADER_DELIM = Buffer.from("\r\n\r\n");

    const tryParseLspResponse = () => {
      const delimIdx = stdoutBuf.indexOf(HEADER_DELIM);
      if (delimIdx === -1) return;

      const headerStr = stdoutBuf.subarray(0, delimIdx).toString("ascii");
      const lenMatch = /Content-Length:\s*(\d+)/i.exec(headerStr);
      if (!lenMatch) return;

      const contentLength = Number.parseInt(lenMatch[1], 10);
      const bodyStart = delimIdx + HEADER_DELIM.length;
      if (stdoutBuf.length < bodyStart + contentLength) return;

      const bodyBytes = stdoutBuf.subarray(
        bodyStart,
        bodyStart + contentLength,
      );
      stdoutBuf = stdoutBuf.subarray(bodyStart + contentLength);

      try {
        const msg = JSON.parse(bodyBytes.toString("utf8")) as {
          id?: number;
          result?: { capabilities?: unknown };
        };
        if (msg.id === LSP_INITIALIZE_ID && msg.result?.capabilities) {
          succeed();
        }
      } catch {
        // Incomplete or malformed JSON — wait for more data
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
      tryParseLspResponse();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes(MODULE_NOT_FOUND)) {
        fail(`ALS CLI stderr contains ${MODULE_NOT_FOUND}: ${stderr}`);
      }
    });

    child.on("error", (err) => {
      fail(`Failed to spawn ALS CLI: ${String(err)}`);
    });

    child.stdin.on("error", (err) => {
      fail(`ALS CLI stdin write error: ${String(err)}`);
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      if (stderr.includes(MODULE_NOT_FOUND)) {
        fail(`ALS CLI exited with missing module: ${stderr}`);
        return;
      }
      if (signal !== null && signal !== "SIGTERM") {
        fail(`ALS CLI terminated by signal ${signal}: ${stderr}`);
        return;
      }
      if (code !== null && code !== 0) {
        fail(`ALS CLI exited with code ${code}: ${stderr}`);
        return;
      }
      tryParseLspResponse();
      setTimeout(() => {
        if (settled) return;
        tryParseLspResponse();
        if (settled) return;
        fail(
          "ALS CLI exited before responding to LSP initialize — " +
            "bundles may not have loaded" +
            (stderr ? ` (stderr: ${stderr})` : ""),
        );
      }, 50).unref();
    });

    // Send LSP initialize request so the server proves it can load and run
    const initBody = JSON.stringify({
      id: LSP_INITIALIZE_ID,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        processId: null,
        rootUri: null,
      },
    });
    child.stdin.write(lspFrame(initBody));

    const timer = setTimeout(() => {
      fail(
        "ALS CLI did not respond to LSP initialize within " +
          `${timeoutMs}ms — bundles may not have loaded`,
      );
    }, timeoutMs);
  });
}
