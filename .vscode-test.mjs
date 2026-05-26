import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    files: "out/test/integration/**/*.test.js",
    installExtensions: ["ms-python.vscode-python-envs"],
    mocha: { timeout: 60000 },
  },
]);
