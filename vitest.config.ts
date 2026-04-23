// used for unit tests from test/unit
import { defineConfig } from "vitest/config";
import path, { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";

// see https://vitest.dev/guide/migration.html
// we use this approach because it allows 'knip' to also detect the imports
// otherwise it gets confused about projects use in config and fail to
// resolve the relative paths, as each path is relative to the root of the
// current project.
const als_root = resolve(__dirname, "packages", "ansible-language-server");
const mcp_root = resolve(__dirname, "packages", "ansible-mcp-server");
// Save real HOME before any globalSetup overrides it.
// ALS @ee tests need the original HOME — rootless podman is ~60x slower
// with a redirected HOME directory.
process.env._ALS_ORIGINAL_HOME =
  process.env.HOME || process.env.USERPROFILE || "";

const reporters = ["default", "junit"]; // text-summary shows only overall coverage stats, skipping per-file details
if (process.env.GITHUB_ACTIONS) {
  reporters.push("github-actions");
}
const coverage_reporters = ["cobertura", "lcovonly", "text-summary", "text"];

// Disable coverage when the user is running a targeted subset of tests, e.g.:
//   vitest -t "my test name"
//   vitest run src/foo.test.ts
// Partial runs produce misleading (always-low) coverage numbers and slow down
// the interactive feedback loop.
const vitestSubcommands = new Set([
  "run",
  "watch",
  "dev",
  "bench",
  "list",
  "typecheck",
]);
const isFiltered = process.argv.slice(2).some((arg) => {
  if (arg === "-t" || arg === "--testNamePattern") return true;
  // A positional arg that is not a flag and not a vitest subcommand is a file filter
  return !arg.startsWith("-") && !vitestSubcommands.has(arg);
});

export default defineConfig({
  test: {
    name: "ext",
    projects: [
      {
        extends: true,
        test: {
          name: "ext",
          globals: true,
          globalSetup: ["test/unit/globalSetup.ts"],
          environment: "node",
          fileParallelism: false,
          include: ["test/unit/**/*.test.ts"],
          exclude: ["test/unit/webviews/**"],
          setupFiles: ["./test/unit/vitestSetup.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          vue({
            template: {
              compilerOptions: {
                isCustomElement: (tag: string) => tag.startsWith("vscode-"),
              },
            },
          }),
        ],
        test: {
          name: "vue",
          globals: true,
          environment: "jsdom",
          include: ["test/unit/webviews/**/*.test.ts"],
          setupFiles: ["./test/unit/webviews/vitestSetup.ts"],
          exclude: [],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "@src": path.resolve(als_root, "src"),
            "@test": path.resolve(als_root, "test"),
          },
        },
        test: {
          name: "als",
          globals: true,
          globalSetup: [`${als_root}/test/globalSetup.ts`],
          environment: "node",
          exclude: ["node_modules", "out"],
          fileParallelism: false,
          include: ["test/**/*.test.ts"],
          isolate: true, // required or will produce MaxListenersExceededWarning warnings
          root: als_root, // ensure reports have valid paths
          testTimeout: 60000, // same as mocha timeout (60 seconds)
          setupFiles: [`${als_root}/test/vitestSetup.ts`],
          sequence: {
            concurrent: false,
            groupOrder: 2,
          },
          //slowTestThreshold: 8000, // tests with >8s will show duration in yellow/red
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "@src": path.resolve(mcp_root, "src"),
            "@test": path.resolve(mcp_root, "test"),
          },
        },
        test: {
          name: "mcp",
          globals: true,
          environment: "node",
          exclude: ["test/fixtures/**"],
          include: ["test/**/*.test.ts"],
          root: mcp_root,
          sequence: {
            concurrent: false,
            groupOrder: 1,
          },
          testTimeout: 30000, // 30 seconds for tests that might spawn processes
        },
      },
    ],
    environment: "node",
    globals: true,
    silent: true,
    coverage: {
      // cannot be configured for sub-projects
      allowExternal: false,
      cleanOnRerun: true,
      clean: true,
      enabled: !isFiltered,
      exclude: [],
      include: [
        "src/**/**.{js,jsx,ts,tsx}",
        "packages/ansible-language-server/src/**/*.{js,jsx,ts,tsx}",
        "packages/ansible-mcp-server/src/**/*.{js,jsx,ts,tsx}",
        "webviews/**/*.{ts,vue}",
      ], // Include source files, workspace packages, and webviews for coverage
      provider: "v8",
      reportOnFailure: false,
      reportsDirectory: `${__dirname}/out/coverage/unit`,
      reporter: coverage_reporters,
      skipFull: true,
      thresholds: {
        // We cannot enable until we normalize the results across all platforms.
        // autoUpdate:
        //   process.platform === "linux" && process.env.IS_WSL !== "1"
        //     ? (newThreshold: number) => Math.floor(newThreshold)
        //     : false,
        branches: 42,
      },
      watermarks: {
        branches: [0, 44],
        functions: [0, 51],
        lines: [0, 49],
        statements: [0, 49],
      },
    },
    outputFile: {
      // cannot be configured for sub-projects
      junit: resolve(__dirname, "out/junit/unit-test-results.xml"),
    },
    reporters: reporters,
    slowTestThreshold: 25000,
    testTimeout: 30003,
    watch: false,
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "./test/unit/mocks/vscode.ts"),
      "@src": path.resolve(__dirname, "src"),
      "@webviews": path.resolve(__dirname, "webviews"),
      "@test": path.resolve(__dirname, "test"),
      "@root": path.resolve(__dirname),
      "@primeuix/themes": path.resolve(
        __dirname,
        "node_modules/@primeuix/themes/dist",
      ),
    },
  },
});
