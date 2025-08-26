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
      webview: {
        csp: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-{{nonce}}' 'unsafe-inline'; style-src {{cspSource}} 'unsafe-inline'; font-src {{cspSource}};">`,
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
  publicDir: "media",
  build: {
    minify: false,
    outDir: "out/vitebuild",
    emptyOutDir: true,
    rollupOptions: {
      // https://cn.vitejs.dev/guide/build.html#multi-page-app
      input: {
        "role-generation": path.resolve(
          __dirname,
          "webviews/lightspeed/role-generation.html",
        ),
        "playbook-generation": path.resolve(
          __dirname,
          "webviews/lightspeed/playbook-generation.html",
        ),
        explanation: path.resolve(
          __dirname,
          "webviews/lightspeed/explanation.html",
        ),
        "hello-world": path.resolve(
          __dirname,
          "webviews/lightspeed/hello-world.html",
        ),
        "create-ansible-collection": path.resolve(
          __dirname,
          "webviews/create-ansible-collection.html",
        ),
        "create-ansible-project": path.resolve(
          __dirname,
          "webviews/create-ansible-project.html",
        ),
        "add-plugin": path.resolve(__dirname, "webviews/add-plugin.html"),
        "create-role": path.resolve(__dirname, "webviews/create-role.html"),
        "add-pattern": path.resolve(__dirname, "webviews/add-pattern.html"),
        "create-devcontainer": path.resolve(
          __dirname,
          "webviews/create-devcontainer.html",
        ),
        "create-devfile": path.resolve(
          __dirname,
          "webviews/create-devfile.html",
        ),
      },
    },
  },
});
