/**
 * Pre-install extension dependencies for WDIO UI tests.
 *
 * Uses @vscode/test-electron to download VS Code (or reuse a cached
 * copy), then installs marketplace extensions into the same isolated
 * --extensions-dir that wdio.conf.ts passes at launch time.
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
  "redhat.vscode-yaml",
];

const INSTALL_MAX_ATTEMPTS = 5;
const INSTALL_RETRY_BASE_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installExtension(cliPath, ext) {
  execSync(
    `"${cliPath}" --install-extension ${ext} --force` +
      ` --extensions-dir "${extensionsDir}"`,
    { stdio: "inherit" },
  );
}

async function installExtensionWithRetry(cliPath, ext) {
  for (let attempt = 1; attempt <= INSTALL_MAX_ATTEMPTS; attempt++) {
    try {
      installExtension(cliPath, ext);
      return;
    } catch (error) {
      if (attempt >= INSTALL_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = INSTALL_RETRY_BASE_MS * attempt;
      console.warn(
        `Installing ${ext} failed (attempt ${attempt}/${INSTALL_MAX_ATTEMPTS}), retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }
}

fs.mkdirSync(extensionsDir, { recursive: true });

const vscodePath = await download({
  cachePath: testRoot,
  version: "stable",
});
const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodePath);

for (const ext of DEPENDENCY_EXTENSIONS) {
  console.log(`Installing: ${ext}`);
  await installExtensionWithRetry(cliPath, ext);
}

console.log("UI test dependency extensions installed.");
