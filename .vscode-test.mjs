// https://github.com/microsoft/vscode-test-cli
// Used by e2e tests
import { defineConfig } from "@vscode/test-cli";
import { spawnSync } from "node:child_process";

// import { exec } from "node:child_process";
import { readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// process.chdir(dirname(import.meta.dirname));

const userDataDir = "out/userdata";
const extensionsDir = "out/ext";
const testResourcesDir = "out/test-resources";

let extPath;
for (const filename of readdirSync(".")) {
  if (filename.endsWith(".vsix")) {
    extPath = `${filename}`;
    break;
  }
}

if (!extPath) {
  throw new Error("No .vsix file found");
}
/* Apparently vscode-test silently fails to install any extensions when we
configure extensionDevelopmentPath: [], which is the only way to prevent it
from loading current extension in development mode.

Using development mode during testing fails to test packaging problems and
we had at least two serious situations where the vsix file was fully broken.

Instead we make use of extest ability to install both local vsix and remote
ones as it also have good caching support.
*/

// Copy settings.json to user data directory
const settingsSource = "test/testFixtures/settings.json";
const settingsDest = join(userDataDir, "User", "settings.json");
globalThis.console.log(`Copying ${settingsSource} to ${settingsDest}`);
mkdirSync(join(userDataDir, "User"), { recursive: true });
copyFileSync(settingsSource, settingsDest);

globalThis.console.log("install other extensions");
const result1 = spawnSync(
  "extest",
  [
    "install-from-marketplace",
    "ms-python.python",
    `--extensions_dir=${extensionsDir}`,
    `--storage=${testResourcesDir}`,
  ],
  { stdio: "inherit" },
);
if (result1.status !== 0) {
  throw new Error(
    `extest install-from-marketplace failed with exit code ${result1.status}`,
  );
}
globalThis.console.log("install local vsix file");
const result2 = spawnSync(
  "extest",
  [
    "install-vsix",
    `--vsix_file=${extPath}`,
    `--extensions_dir=${extensionsDir}`,
    `--storage=${testResourcesDir}`,
  ],
  { stdio: "inherit" },
);
if (result2.status !== 0) {
  throw new Error(
    `extest install-vsix failed with exit code ${result2.status}`,
  );
}

const launchArgs = [
  // cannot rely on vscode-test ability to install extensions because it does
  // implicitly use --force and the server can respond with 503 errors. But
  // we could use extest to install extensions, which is more resilient.
  "--disable-gpu", // avoids misleading console messages during local or CI/CD test like VK_ERROR_INCOMPATIBLE_DRIVER
  `--user-data-dir=${userDataDir}`,
  `--extensions-dir=${extensionsDir}`,
  "--disable-extension=alefragnani.project-manager",
  "--disable-extension=eamodio.gitlens",
  "--disable-extension=GitHub.copilot",
  "--disable-extension=GitHub.vscode-pull-request-github",
  "--disable-extension=lextudio.restructuredtext",
  "--disable-extension=ms-vsliveshare.vsliveshare",
  "--disable-extension=redhat.fabric8-analytics",
  "--disable-extension=ritwickdey.liveserver",
  "--disable-extension=streetsidesoftware.code-spell-checker",
  "--coverage",
  "--coverage-output=./out/coverage/e2e",
  "--coverage-reporter=text",
  "--coverage-reporter=cobertura",
  "--coverage-reporter=lcovonly",
];

globalThis.console.log(`vscode-test ${launchArgs.join(" ")}`);

export default defineConfig({
  files: "out/client/test/e2e/*.test.js",
  extensionDevelopmentPath: [], // do not change, see explanation above
  workspaceFolder: "test/testFixtures",
  launchArgs: launchArgs,
  mocha: {
    color: true,
    ui: "bdd",
    slow: 25_000,
    timeout: 50_000,
    reporter: "cypress-multi-reporters",
    reporterOptions: {
      reporterEnabled: "spec,mocha-junit-reporter",
      mochaJunitReporterReporterOptions: {
        attachments: true,
        includePending: true,
        mochaFile: "./out/junit/e2e/test-results.xml",
        outputs: true,
        toConsole: false,
        suiteTitle: "e2e",
        suiteTitleSeparatedBy: "::",
      },
    },
    preload: "ts-node/register",
    require: [
      "ts-node/register",
      "./test/e2e/rootMochaHooks.ts", // this file must be loaded last
    ],
  },
});
