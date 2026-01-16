// used for Vue component unit tests
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
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
    globals: true,
    environment: "jsdom",
    include: ["test/unit/webviews/**/*.test.ts"],
    setupFiles: ["./test/unit/webviews/vitestSetup.ts"],
    coverage: {
      provider: "v8",
      cleanOnRerun: true,
      clean: true,
      enabled: true,
      reportsDirectory: "./out/coverage/vue",
      reporter: ["cobertura", "lcovonly", "text", "text-summary"],
      include: [
        "webviews/lightspeed/src/ExplorerApp.vue",
        "webviews/lightspeed/src/ExplanationApp.vue",
        "webviews/lightspeed/src/FeedbackApp.vue",
        "webviews/lightspeed/src/PlaybookGenApp.vue",
        "webviews/lightspeed/src/RoleGenApp.vue",
        "webviews/lightspeed/src/components/*.vue",
        "webviews/lightspeed/src/components/lightspeed/*.vue",
        "webviews/lightspeed/src/utils/*.ts",
      ],
      exclude: [],
    },
    outputFile: {
      junit: "./out/junit/vue/vue-test-results.xml",
    },
    reporters: ["default", "junit"],
    testTimeout: 30000,
  },
});
