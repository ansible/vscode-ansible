// used for unit tests from test/unit
import { defineConfig } from "vitest/config";

// see https://vitest.dev/guide/migration.html
export default defineConfig({
  test: {
    globals: true,
    silent: true,
    include: ["test/unit/**/*.test.ts"],
    exclude: ["test/unit/contentCreator/**", "test/unit/webviews/**"],
    setupFiles: ["./test/unit/vitestSetup.ts"],
    coverage: {
      provider: "v8",
      cleanOnRerun: true,
      clean: true,
      enabled: true,
      reportsDirectory: "./out/coverage/unit",
      reporter: ["cobertura", "lcovonly", "text", "text-summary"], // text-summary shows only overall coverage stats, skipping per-file details
      include: ["src/**/**.{js,jsx,ts,tsx}"], // Include source files for coverage
      exclude: [],
      thresholds: {
        branches: 8.45,
      },
    },
    outputFile: {
      junit: "./out/junit/unit/unit-test-results.xml",
    },
    reporters: ["default", "junit"],
    testTimeout: 30003,
    slowTestThreshold: 25000,
  },
});
