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

export default defineConfig({
  test: {
    name: "ext",
    projects: [
      {
        extends: true,
        test: {
          name: "ext",
          globals: true,
          // globalSetup: ["test/unit/vitestSetup.ts"],
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
      allowExternal: false,
      cleanOnRerun: true,
      clean: true,
      enabled: true,
      exclude: [],
      include: ["src/**/**.{js,jsx,ts,tsx}", "webviews/**/*.{ts,vue}"], // Include source files for coverage
      provider: "v8",
      reportOnFailure: false,
      reportsDirectory: "./out/coverage/unit",
      reporter: ["cobertura", "lcovonly", "text-summary", "text"], // text-summary shows only overall coverage stats, skipping per-file details
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
      junit: resolve(__dirname, "out/junit/unit-test-results.xml"),
    },
    reporters: ["default", "junit"],
    slowTestThreshold: 25000,
    testTimeout: 30003,
    watch: false,
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "./test/unit/mocks/vscode.ts"),
      "@src": path.resolve(__dirname, "src/"),
    },
  },
});
