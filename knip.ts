import type { KnipConfig } from "knip";

const config: KnipConfig = {
  eslint: {
    config: [
      "eslint.config.{js,cjs,mjs,ts,cts,mts}",
      ".eslintrc",
      "**/.eslintrc.{js,json,cjs}",
      ".eslintrc.{yml,yaml}",
      "package.json",
    ],
  },
  includeEntryExports: true,
  ignoreDependencies: [
    "@ansible/ansible-mcp-server",
    "@biomejs/biome",
    "@tomjs/vite-plugin-vue",
    "@types/vscode",
    "@types/vscode-webview", // provides acquireVsCodeApi
    "@typescript-eslint/eslint-plugin",
    "@vscode/test-electron",
    "@vscode/vsce",
    "cypress-multi-reporters",
    "eslint-formatter-gha",
    "eslint-formatter-unix",
    "mocha-multi-reporters",
    "mocha-junit-reporter",
    "ovsx",
    "ts-node", // Used by Mocha test runners via string-based require
  ],
  mocha: {
    entry: ["test/e2e/rootMochaHooks.ts"],
  },
  typescript: {
    config: ["**/tsconfig*.json"],
  },
  workspaces: {
    ".": {
      entry: [
        ".vscode-test.mjs",
        "src/**/env.d.ts",
        "src/extension.ts",
        "test/**/*.ts",
        "webviews/**/*.{ts,tsx,vue,js,html}",
      ],
      ignore: [".yarn/**"],
      project: ["{src,test,webviews}/**/*.{mjs,js,json,ts,tsx}"],
    },
    "packages/ansible-language-server": {
      entry: ["src/server.ts", "test/**/*.ts"],
      project: ["**/*.{mjs,js,json,ts,tsx}"],
    },
    "packages/ansible-mcp-server": {
      entry: ["test/**/*.ts"],
      project: ["**/*.{mjs,js,json,ts,tsx}"],
    },
  },
  treatConfigHintsAsErrors: true,
};

export default config;
