/// <reference path="node_modules/vite/dist/node/index.d.ts" />
import path from "node:path";
import vscode from "@tomjs/vite-plugin-vscode";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: false,
    outDir: "dist", // keep default
    rollupOptions: {
      // https://cn.vitejs.dev/guide/build.html#multi-page-app
      input: {
        "add-plugin": path.resolve(__dirname, "webviews/add-plugin.html"),
        "create-ansible-collection": path.resolve(
          __dirname,
          "webviews/create-ansible-collection.html",
        ),
        "create-ansible-project": path.resolve(
          __dirname,
          "webviews/create-ansible-project.html",
        ),
        "create-devcontainer": path.resolve(
          __dirname,
          "webviews/create-devcontainer.html",
        ),
        "create-devfile": path.resolve(
          __dirname,
          "webviews/create-devfile.html",
        ),
        "create-execution-env": path.resolve(
          __dirname,
          "webviews/create-execution-env.html",
        ),
        "create-role": path.resolve(__dirname, "webviews/create-role.html"),
        explanation: path.resolve(
          __dirname,
          "webviews/lightspeed/explanation.html",
        ),
        explorer: path.resolve(__dirname, "webviews/lightspeed/explorer.html"),
        "hello-world": path.resolve(
          __dirname,
          "webviews/lightspeed/hello-world.html",
        ),
        "llm-provider": path.resolve(__dirname, "webviews/llm-provider.html"),
        "playbook-generation": path.resolve(
          __dirname,
          "webviews/lightspeed/playbook-generation.html",
        ),
        "quick-links": path.resolve(__dirname, "webviews/quick-links.html"),
        "role-generation": path.resolve(
          __dirname,
          "webviews/lightspeed/role-generation.html",
        ),
        "welcome-page": path.resolve(__dirname, "webviews/welcome-page.html"),
      },
    },
  },
  experimental: {
    renderBuiltUrl(filename: string) {
      if (filename.startsWith("assets/codicon.ttf")) {
        return { relative: true };
      }
    },
  },
  plugins: [
    vscode({
      extension: {
        entry: "src/extension.ts",
        //minify: false,
      },
      webview: {
        csp: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-{{nonce}}' 'unsafe-inline'; style-src {{cspSource}} 'unsafe-inline'; font-src {{cspSource}}; img-src 'self' {{cspSource}} https: data:;">`,
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
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "src"),
      "@webviews": path.resolve(__dirname, "webviews"),
    },
  },
});
