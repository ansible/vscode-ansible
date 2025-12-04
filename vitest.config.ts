import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/unit/vitest/**/*.test.ts"],
    exclude: [
      "test/fixtures/**",
      "test/unit/lightspeed/**/*.test.ts",
      "test/unit/mcp/**/*.test.ts",
      "test/unit/contentCreator/**/*.test.ts",
      "node_modules/**",
    ],
    setupFiles: ["./test/unit/vitest/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "cobertura"],
      // Output to a subdirectory to avoid overwriting mocha/c8 coverage
      // The CI pattern ./**/coverage/unit/*cobertura-coverage.xml will still match this
      reportsDirectory: "./out/coverage/unit/vitest",
      exclude: [
        "node_modules/",
        "out/",
        "test/**",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
    // Output test results in junit format for CI
    outputFile: {
      junit: "./out/junit/unit/vitest-test-results.xml",
    },
    reporters: ["default", "junit"],
    testTimeout: 30000,
  },
  // Note: Removed explicit resolve.extensions to allow vitest 4.0.14's default
  // TypeScript resolution behavior, which automatically resolves .js imports to .ts files
});
