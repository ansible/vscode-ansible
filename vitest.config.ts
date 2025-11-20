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
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "out/",
        "test/**",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
    testTimeout: 30000,
  },
});

