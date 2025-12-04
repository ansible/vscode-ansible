import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    exclude: [
      "test/fixtures/**",
      "test/consoleOutput.ts",
      "test/helper.ts",
      "test/index.ts",
      "test/validate-ls.ts",
      "test/rootMochaHooks.ts",
      "test/vitestSetup.ts",
    ],
    setupFiles: ["./test/vitestSetup.ts"],
    coverage: {
      provider: "v8",
      enabled: true,
      reportsDirectory: "../../out/coverage/als",
      reporter: ["cobertura", "lcovonly", "text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/__tests__/**",
        "**/*.d.ts",
        "**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}",
        "test{,s}/**",
        "node_modules/**",
        "out/**",
      ],
      thresholds: {
        branches: 80.31,
        lines: 0, // No line threshold requirement
      },
    },
    outputFile: {
      junit: "../../out/junit/als/als-test-results.xml",
    },
    reporters: ["default", "junit"],
    testTimeout: 60000, // 60 seconds for tests that load yaml files and docs library
    slowTestThreshold: 8000, // Tests >8s show duration in yellow, >16s in red
  },
});

