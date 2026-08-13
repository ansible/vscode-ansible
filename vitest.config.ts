// used for unit tests from test/unit
import { defineConfig } from "vitest/config";
import path, { resolve } from "node:path";
import { readFileSync } from "node:fs";
import vue from "@vitejs/plugin-vue";

// Prefer __dirname here (same as als_root/mcp_root below). Do not import
// ./test/setup — eslint no-restricted-imports bans relative imports, and
// @test/* aliases are not available while this config file is loading.
const alsPackageVersion = (
  JSON.parse(
    readFileSync(
      resolve(__dirname, "packages/ansible-language-server/package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;

// see https://vitest.dev/guide/migration.html
// we use this approach because it allows 'knip' to also detect the imports
// otherwise it gets confused about projects use in config and fail to
// resolve the relative paths, as each path is relative to the root of the
// current project.
const als_root = resolve(__dirname, "packages", "ansible-language-server");
const mcp_root = resolve(__dirname, "packages", "ansible-mcp-server");
// ALS unit tests use podman/docker and a Linux-oriented toolchain; skip on Windows
// (matches packages/ansible-language-server/Taskfile.yml test platforms).
const skipAlsTests = process.platform === "win32";
// Save real HOME before any globalSetup overrides it.
// ALS @ee tests need the original HOME — rootless podman is ~60x slower
// with a redirected HOME directory.
if (!skipAlsTests) {
  process.env._ALS_ORIGINAL_HOME =
    process.env.HOME || process.env.USERPROFILE || "";
}

const reporters = ["default", "junit"]; // text-summary shows only overall coverage stats, skipping per-file details
if (process.env.GITHUB_ACTIONS) {
  reporters.push("github-actions");
}

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

const alsVitestProject = {
  extends: true as const,
  define: {
    // Match tsdown define so importing src/cli.ts in unit tests works.
    PACKAGE_VERSION: JSON.stringify(alsPackageVersion),
  },
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
    hookTimeout: 30000, // self-hosted WSL runner needs more than the 10s default
    setupFiles: [`${als_root}/test/vitestSetup.ts`],
    sequence: {
      concurrent: false,
      groupOrder: 2,
    },
    //slowTestThreshold: 8000, // tests with >8s will show duration in yellow/red
  },
};

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
      ...(skipAlsTests ? [] : [alsVitestProject]),
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
      exclude: [
        // Pure bootstrap/demo webview entrypoints (createApp().mount() glue / demo)
        "webviews/lightspeed/src/explanation.ts",
        "webviews/lightspeed/src/hello-world.ts",
        "webviews/lightspeed/src/playbook-generation.ts",
        "webviews/lightspeed/src/role-generation.ts",
        "webviews/lightspeed/src/HelloWorld.vue",
        "webviews/lightspeed/src/explorer.ts",
      ],
      include: [
        "src/**/**.{js,jsx,ts,tsx}",
        ...(skipAlsTests
          ? []
          : ["packages/ansible-language-server/src/**/*.{js,jsx,ts,tsx}"]),
        "packages/ansible-mcp-server/src/**/*.{js,jsx,ts,tsx}",
        "webviews/**/*.{ts,vue}",
      ], // Include source files, workspace packages, and webviews for coverage
      provider: "v8",
      reportOnFailure: false,
      reportsDirectory: `${__dirname}/out/coverage/unit`,
      reporter: [
        ["lcovonly", { file: "lcov.info", projectRoot: __dirname }],
        "text-summary",
        "text",
      ],
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
