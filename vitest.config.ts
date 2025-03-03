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
    environment: "happy-dom",
    include: ["test/units/lightspeed-vitest/**/*.ts"],
    exclude: ["test/units/lightspeed-vitest/setupTests.ts"],
    setupFiles: ["test/units/lightspeed-vitest/setupTests.ts"],
  },
});
