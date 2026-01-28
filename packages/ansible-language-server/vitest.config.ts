import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  test: {
    globals: true,
    globalSetup: [`${__dirname}/test/globalSetup.ts`],
    environment: "node",
    exclude: ["node_modules", "out"],
    fileParallelism: false,
    coverage: {
      clean: true,
      cleanOnRerun: true,
      enabled: true,
      exclude: [],
      include: ["src/**/*.{js,ts}"],
      provider: "v8",
      reporter: ["cobertura", "json", "lcovonly"],
      reportsDirectory: "./out/coverage/als", // relative to config root entry
      thresholds: {
        branches: process.platform === "linux" ? 22.78 : 0.0,
      },
    },
    include: [`${__dirname}/test/**/*.test.ts`],
    isolate: false,
    outputFile: {
      junit: "./out/junit/als-test-results.xml", // relative to config root entry
    },
    reporters: ["default", "junit"],
    root: resolve(__dirname, "..", ".."), // ensure reports have valid paths
    testTimeout: 60000, // same as mocha timeout (60 seconds)
    setupFiles: [`${__dirname}/test/vitestSetup.ts`],
    sequence: {
      concurrent: false,
    },
    slowTestThreshold: 8000, // tests with >8s will show duration in yellow/red
  },
});
