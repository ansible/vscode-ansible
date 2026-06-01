/// <reference types="wdio-vscode-service" />
import path from "node:path";

const testRoot = path.resolve(process.cwd(), ".wdio-vscode");
const extensionsDir = path.join(testRoot, "extensions");

export const config: WebdriverIO.Config = {
  runner: "local",
  autoCompileOpts: {
    tsNodeOpts: {
      project: "./test/wdio/tsconfig.json",
    },
  },
  specs: ["./test/wdio/**/*.spec.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "vscode",
      browserVersion: "stable",
      "wdio:vscodeOptions": {
        extensionPath: path.resolve(process.cwd()),
        workspacePath: path.resolve(process.cwd(), "test", "wdio", "fixtures"),
        userSettings: {
          "editor.fontSize": 14,
          "ansible.lightspeed.enabled": true,
          "ansible.validation.lint.enabled": false,
        },
        vscodeArgs: {
          "extensions-dir": extensionsDir,
          "disable-extensions": false,
          "disable-gpu": true,
        },
      },
    },
  ],

  logLevel: "warn",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [
    [
      "vscode",
      {
        cachePath: testRoot,
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 120000,
  },
};
