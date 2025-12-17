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
    "@ansible/ansible-language-server",
    "@ansible/ansible-mcp-server",
    "@tomjs/vite-plugin-vue",
    "@types/mocha",
    "@types/vscode",
    "@types/vscode-webview", // provides acquireVsCodeApi
    "@typescript-eslint/eslint-plugin",
    "@vscode/test-electron",
    "@vscode/vsce",
    "cypress-multi-reporters",
    "eslint-formatter-gha",
    "eslint-formatter-unix",
    "mocha",
    "mocha-junit-reporter",
    "mocha-multi-reporters",
    "ovsx",
  ],
  ignoreFiles: ["**/.ansible/**"],
  ignoreExportsUsedInFile: {
    function: true,
    interface: true,
    type: false,
  },
  typescript: {
    config: ["**/tsconfig*.json"],
  },
  workspaces: {
    ".": {
      entry: [
        "src/extension.ts",
        "webviews/**/*.{ts,tsx}",
        "test/**/*.ts",
        ".vscode-test.mjs",
      ],
      project: ["{src,test,webviews}/**/*.{mjs,js,json,ts,tsx}"],
    },
    "packages/ansible-language-server": {
      entry: ["src/server.ts", "test/**/*.ts"],
      project: ["**/*.{mjs,js,json,ts,tsx}"],
    },
    "packages/ansible-mcp-server": {
      entry: ["src/cli.ts", "test/**/*.ts"],
      project: ["**/*.{mjs,js,json,ts,tsx}"],
    },
  },
  treatConfigHintsAsErrors: true,
};

export default config;
