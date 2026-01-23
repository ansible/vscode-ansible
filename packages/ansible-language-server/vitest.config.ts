// used for unit tests in ansible-language-server package
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules", "out"],
    setupFiles: ["./test/vitestSetup.ts"],
    globalSetup: ["./test/globalSetup.ts"],
    isolate: false,
    fileParallelism: false, // Run test files sequentially like Mocha did - needed for container tests
    sequence: {
      concurrent: false,
    },
    coverage: {
      provider: "v8",
      enabled: true,
      cleanOnRerun: true,
      clean: true,
      reportsDirectory: "../../out/coverage/als",
      reporter: ["cobertura", "json"],
      include: ["src/**/*.{js,ts}"],
      exclude: [],
    },
    outputFile: {
      junit: "../../out/junit/als/als-test-results.xml",
    },
    reporters: ["default", "junit"],
    testTimeout: 60000, // same as mocha timeout (60 seconds)
    slowTestThreshold: 8000, // tests with >8s will show duration in yellow/red
  },
});
