// https://github.com/microsoft/vscode-test-cli
// Used by e2e tests

import { defineConfig } from "@vscode/test-cli";

/**
 * @public
 */
export default defineConfig({
  files: "test/e2e/**/*.test.ts",
  extensionDevelopmentPath: ".", // package.json location
  workspaceFolder: "test/testFixtures",
  launchArgs: [
    // cannot rely on vscode-test ability to install extensions because it does
    // implicitly use --force and the server can respond with 503 errors.
    // "--install-extensions=ms-python.python,redhat.vscode-yaml",
    "--disable-gpu", // avoids misleading console messages during local or CI/CD test like VK_ERROR_INCOMPATIBLE_DRIVER
    "--user-data-dir=.vscode-test/user-data", // do not try other location because it will split lots in two as some happen before this is effective
    "--extensions-dir=.vscode-test/extensions",
    "--disable-extension=alefragnani.project-manager",
    "--disable-extension=eamodio.gitlens",
    "--disable-extension=GitHub.copilot",
    "--disable-extension=GitHub.vscode-pull-request-github",
    "--disable-extension=lextudio.restructuredtext",
    "--disable-extension=ms-vsliveshare.vsliveshare",
    "--disable-extension=redhat.fabric8-analytics",
    "--disable-extension=ritwickdey.liveserver",
    "--disable-extension=streetsidesoftware.code-spell-checker",
  ],
  mocha: {
    color: true,
    ui: "bdd",
    slow: 25_000,
    timeout: 50_000,
    reporter: "cypress-multi-reporters",
    preload: "tsx/cjs",
    reporterOptions: {
      reporterEnabled: "spec,mocha-junit-reporter",
      mochaJunitReporterReporterOptions: {
        attachments: true,
        includePending: true,
        mochaFile: "./out/junit/e2e-test-results.xml",
        outputs: true,
        toConsole: false,
        suiteTitle: "e2e",
        suiteTitleSeparatedBy: "::",
      },
    },
    require: [
      "./test/e2e/rootMochaHooks.ts", // this file must be loaded last
    ],
  },
  coverage: {
    includeAll: true,
    exclude: ["**/node_modules", "out/server/external", "out/server/webpack/"],
  },
});
