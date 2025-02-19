import path from "node:path";
import { defineConfig } from "vite";
import vscode from "@tomjs/vite-plugin-vscode";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [
    vscode({
      extension: {
        entry: "src/extension.ts",
        //minify: false,
      },
    }),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag: string) => tag.startsWith("vscode-"),
        },
      },
    }),
  ],
  build: {
    minify: false,
    outDir: "out/vitebuild",
    emptyOutDir: true,
    rollupOptions: {
      // https://cn.vitejs.dev/guide/build.html#multi-page-app
      input: {
        roleGen: path.resolve(
          __dirname,
          "webviews/lightspeed/role-generation/index.html",
        ),
      },
    },
  },
});
