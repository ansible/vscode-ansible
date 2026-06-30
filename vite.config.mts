import fs from "node:fs";
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { createLogger, defineConfig, type Plugin } from "vite";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
const ANSI_RE = /\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex

/** Rolldown reporter table lines: `dist/...  12.34 kB` (optional `│ gzip: ...`). */
const BUILD_OUTPUT_LINE_RE = /dist\/\S+\s+[\d.]+\s+kB/;

function stripAnsi(msg: string): string {
  return msg.replace(ANSI_RE, "");
}

function isBuildOutputTable(msg: string): boolean {
  const lines = stripAnsi(msg).trim().split("\n").filter(Boolean);
  return (
    lines.length > 0 &&
    lines.every((line) => BUILD_OUTPUT_LINE_RE.test(line.trim()))
  );
}

const baseLogger = createLogger("info");
const logger = createLogger("info", {
  customLogger: {
    ...baseLogger,
    info(msg, options) {
      if (isBuildOutputTable(msg)) {
        return;
      }
      baseLogger.info(msg, options);
    },
  },
});

/**
 * Writes the dev server URL to a marker file so the extension host can
 * detect it and serve webview HTML directly from the dev server (enabling HMR).
 */
function viteDevServerUrl(): Plugin {
  const markerPath = path.resolve(__dirname, "out", ".vite-dev-server-url");
  const pidPath = path.resolve(__dirname, "out", ".vite-dev.pid");
  return {
    buildEnd() {
      // Clean up marker file during production builds
      try {
        fs.unlinkSync(markerPath);
      } catch {
        // ignore if not present
      }
    },
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (address && typeof address === "object") {
          const url = `http://localhost:${address.port}`;
          fs.mkdirSync(path.dirname(markerPath), { recursive: true });
          fs.writeFileSync(markerPath, url, "utf8");
          fs.writeFileSync(pidPath, String(process.pid), "utf8");
        }
      });
      server.httpServer?.once("close", () => {
        try {
          fs.unlinkSync(markerPath);
        } catch {
          // ignore if not present
        }
        try {
          fs.unlinkSync(pidPath);
        } catch {
          // ignore if not present
        }
      });
    },
    name: "vscode-dev-server-url",
  };
}

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: false,
    outDir: "dist", // keep default
    reportCompressedSize: false,
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
  customLogger: logger,
  experimental: {
    renderBuiltUrl(filename: string) {
      if (filename.startsWith("assets/codicon")) {
        return { relative: true };
      }
    },
  },
  plugins: [
    viteDevServerUrl(),
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
  server: {
    cors: true,
    origin: "http://localhost:5173",
    port: 5173,
    strictPort: true,
  },
});
