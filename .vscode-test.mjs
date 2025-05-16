// https://github.com/microsoft/vscode-test-cli
// Used by e2e tests
import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/client/test/e2e/*.test.js",
  extensionDevelopmentPath: ".", // package.json location
  workspaceFolder: "test/testFixtures",
  launchArgs: [
    // cannot rely on vscode-test ability to install extensions because it does
    // implicitly use --force and the server can respond with 503 errors. But
    // we could use extest to install extensions, which is more resilient.
    // "--install-extensions=ms-python.python,redhat.vscode-yaml",
    "--disable-gpu", // avoids misleading console messages during local or CI/CD test like VK_ERROR_INCOMPATIBLE_DRIVER
    "--user-data-dir=out/userdata",
    "--extensions-dir=out/ext",
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
    reporterOptions: {
      reporterEnabled: "spec, mocha-junit-reporter",
      mochaJunitReporterReporterOptions: {
        mochaFile: "./out/junit/e2e-test-results.xml",
        toConsole: false,
        suiteTitle: "e2e",
      },
    },
    preload: "ts-node/register",
    require: [
      "ts-node/register",
      "./test/e2e/rootMochaHooks.ts", // this file must be loaded last
    ],
  },
});
