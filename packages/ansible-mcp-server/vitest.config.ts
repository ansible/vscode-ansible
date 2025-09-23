import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.ts"],
    exclude: ["test/fixtures/**", "test/README.md", "test/testWrapper.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "test/fixtures/**",
        "test/testWrapper.ts",
        "**/*.d.ts",
      ],
    },
    testTimeout: 30000, // 30 seconds for tests that might spawn processes
  },
});
