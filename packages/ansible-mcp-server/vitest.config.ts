import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.ts"],
    exclude: ["test/fixtures/**", "test/README.md", "test/testWrapper.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "../../out/coverage/mcp",
      reporter: ["cobertura", "json"],
      exclude: [
        "node_modules/",
        "dist/",
        "test/fixtures/**",
        "test/testWrapper.ts",
        "**/*.d.ts",
      ],
    },
    outputFile: {
      junit: "../../out/junit/mcp-test-results.xml",
    },
    reporters: ["default", "junit"],
    testTimeout: 30000, // 30 seconds for tests that might spawn processes
  },
});
