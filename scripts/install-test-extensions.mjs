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

fs.mkdirSync(extensionsDir, { recursive: true });

const vscodePath = await download({
  cachePath: testRoot,
  version: "stable",
});
const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodePath);

for (const ext of DEPENDENCY_EXTENSIONS) {
  console.log(`Installing: ${ext}`);
  execSync(
    `"${cliPath}" --install-extension ${ext} --force` +
      ` --extensions-dir "${extensionsDir}"`,
    { stdio: "inherit" },
  );
}

console.log("UI test dependency extensions installed.");
