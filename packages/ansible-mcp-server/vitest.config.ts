import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [`${__dirname}/test/fixtures/**`],
    coverage: {
      exclude: ["node_modules/", "dist/", "test/fixtures/**", "**/*.d.ts"],
      provider: "v8",
      reporter: ["cobertura", "json", "lcovonly"],
      reportsDirectory: "./out/coverage/mcp", // relative to config root entry
      thresholds: {
        branches: process.platform === "linux" ? 53.95 : 0.0,
      },
    },
    include: [`${__dirname}/test/**/*.test.ts`],

    outputFile: {
      junit: "./out/junit/mcp-test-results.xml", // relative to config root entry
    },
    reporters: ["default", "junit"],
    root: resolve(__dirname, "..", ".."),
    testTimeout: 30000, // 30 seconds for tests that might spawn processes
  },
});
