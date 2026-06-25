/**
 * Pre-install extension dependencies for WDIO UI tests.
 *
 * Uses @vscode/test-electron to download VS Code (or reuse a cached
 * copy), then installs marketplace extensions into the same isolated
 * --extensions-dir that wdio.conf.ts passes at launch time.
 *
 * This avoids relying on `code` being on PATH and works in CI.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  download,
  resolveCliPathFromVSCodeExecutablePath,
} from "@vscode/test-electron";

const testRoot = path.resolve(process.cwd(), ".wdio-vscode");
const extensionsDir = path.join(testRoot, "extensions");

const DEPENDENCY_EXTENSIONS = [
  "ms-python.python",
  "ms-python.vscode-python-envs",
  "ms-vscode-remote.remote-wsl",
  "redhat.vscode-yaml",
];

const OPTIONAL_EXTENSIONS = ["redhat.abbenay-provider"];

fs.mkdirSync(extensionsDir, { recursive: true });

const vscodePath = await download({
  cachePath: testRoot,
  version: "stable",
});
const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodePath);

const rootFlags =
  process.getuid?.() === 0
    ? ` --no-sandbox --user-data-dir "${path.join(testRoot, "user-data")}"`
    : "";

for (const ext of DEPENDENCY_EXTENSIONS) {
  console.log(`Installing: ${ext}`);
  execSync(
    `"${cliPath}" --install-extension ${ext} --force` +
      ` --extensions-dir "${extensionsDir}"` +
      rootFlags,
    { stdio: "inherit" },
  );
}

for (const ext of OPTIONAL_EXTENSIONS) {
  console.log(`Installing (optional): ${ext}`);
  try {
    execSync(
      `"${cliPath}" --install-extension ${ext} --force` +
        ` --extensions-dir "${extensionsDir}"` +
        rootFlags,
      { stdio: "inherit" },
    );
  } catch {
    console.warn(`Skipped optional extension ${ext} (not available on this platform)`);
  }
}

console.log("UI test dependency extensions installed.");
