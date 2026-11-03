/// <reference types="wdio-vscode-service" />
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const testRoot = path.resolve(process.cwd(), ".wdio-vscode");
const extensionsDir = path.join(testRoot, "extensions");
const coverageTempDir = path.resolve(
  process.cwd(),
  "out/tmp/.v8-coverage-wdio",
);

function prepareCoverageCollection(): void {
  rmSync(coverageTempDir, { recursive: true, force: true });
  mkdirSync(coverageTempDir, { recursive: true });
  process.env.NODE_V8_COVERAGE = coverageTempDir;
}

export const config: WebdriverIO.Config = {
  runner: "local",
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
          "no-sandbox": true,
        },
      },
    },
  ],

  logLevel: "warn",
  bail: 0,
  // macOS CI: the first chromedriver session can fail with EADDRINUSE /
  // ECONNREFUSED while another VS Code process is still starting. Retry that
  // spec file once. specFileRetriesDelay is in seconds — WDIO sleeps
  // delay * 1000 ms, and it also applies before the first attempt because
  // the runner's retry counter starts at -1. A millisecond value (5000)
  // blocks here for ~83 minutes and trips the 30-minute CI timeout.
  specFileRetries: 1,
  specFileRetriesDelay: 5,
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
  onPrepare: prepareCoverageCollection,
  onComplete: () => {
    execFileSync("node", ["tools/wdio-coverage.mts"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  },
};
