import type { KnipConfig } from "knip";

// In production mode knip cannot trace several genuine production dependencies
// because webviews/ are not reachable from package.json#main and the
// packages/ansible-mcp-server workspace uses built lib/ artifacts (with
// unresolvable @src/* path aliases) as its canonical production entry.
const isProduction = process.argv.includes("--production");

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
    "@biomejs/biome",
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
    // The following genuine runtime deps are only added in --production mode
    // because knip cannot trace them there:
    //   • root workspace: webviews/ are not analyzed (not in package.json main/bin)
    //   • mcp-server workspace: lib/cli.js canonical entry has unresolvable @src/* aliases
    ...(isProduction
      ? [
          // root workspace – webview or deep @src/* chain deps
          "@ansible/ansible-mcp-server", // used as a string constant, not imported
          "@google/genai",
          "@highlightjs/vue-plugin",
          "@primeuix/themes",
          "@redhat-developer/vscode-redhat-telemetry",
          "@tomjs/vscode-webview",
          "@vscode-elements/elements",
          "@vscode/codicons",
          "highlight.js",
          // "ini",
          "js-yaml",
          "marked",
          "minimatch",
          "primevue",
          "semver",
          "uuid",
          "vscode-languageclient",
          "vscode-uri",
          // mcp-server workspace deps (not traceable via built lib/)
          "@modelcontextprotocol/sdk",
          "ajv",
          "ajv-formats",
          "shell-quote",
          "yaml",
          "zod",
        ]
      : []),
  ],
  mocha: {
    entry: ["test/e2e/rootMochaHooks.ts", "test/e2e/e2e.utils.ts"],
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
        "webviews/**/*.{ts,tsx,vue,js}",
      ],
      ignore: [".yarn/**"],
      project: [
        "{src,webviews}/**/*.{mjs,js,json,ts,tsx,vue}",
        "!test/**/*.ts",
      ],
    },
    "packages/ansible-language-server": {
      entry: ["test/**/*.ts"],
      project: [
        "!src/**/*.{mjs,js,json,ts,tsx}!",
        "!test/**/*.ts!",
        "test/*.ts!",
      ],
    },
    "packages/ansible-mcp-server": {
      // src/cli.ts is auto-detected from package.json#bin in non-production mode;
      // in production knip uses lib/cli.js (package.json#module) which contains
      // unresolvable @src/* aliases — all src files are suppressed via ignoreIssues.
      entry: ["test/**/*.ts"],
      project: [
        "{src,tools}/**/*.{mjs,js,json,ts,tsx}!",
        "test/**/*.{mjs,js,json,ts,tsx}!",
      ],
    },
  },
  treatConfigHintsAsErrors: true,
  ignoreIssues: {
    "src/definitions/**": ["exports", "nsExports"],
    // VS Code calls activate/deactivate at runtime — not via import statements
    "src/extension.ts": ["exports"],
    // Exports only consumed by webview Vue files; webviews/ are not analyzed
    // in --production mode (not reachable from package.json#main)
    "src/features/lightspeed/utils/explanationUtils.ts": ["exports"],
    // Exports consumed only by test files (test-accessible helpers)
    "src/features/lightspeed/providers/factory.ts": ["exports"],
    "src/features/lightspeed/statusBar.ts": ["exports"],
    "src/features/lightspeed/utils/outlineGenerator.ts": ["exports"],
    // Files only imported by webview Vue files; not reachable in production
    "src/features/contentCreator/webviewUtils.ts": ["files"],
    // File loaded via dynamic require() — knip cannot trace dynamic imports
    "src/features/lightspeed/ansibleContext.ts": ["files"],
    // Files only referenced by test files (no production caller)
    "src/features/utils/interpreterPathResolver.ts": ["files"],
    "src/webview/apps/common/editableList.ts": ["files"],
    // All mcp-server source files are unreachable in production mode because
    // knip's canonical entry resolves to lib/cli.js which still contains
    // @src/* path aliases that cannot be followed without the workspace tsconfig.
    // "packages/ansible-mcp-server/src/**": ["files"],
    // These helpers are exported for test access only; test files are excluded
    // in production mode. They live in package.json#exports entry files so
    // includeEntryExports:false should suppress them, but the global true wins.
    "packages/ansible-language-server/src/providers/completionProvider.ts": [
      "exports",
    ],
    "packages/ansible-language-server/src/providers/validationProvider.ts": [
      "exports",
    ],
    "packages/ansible-language-server/src/utils/getAnsibleMetaData.ts": [
      "exports",
    ],
    "packages/ansible-mcp-server/src/constants.ts": ["exports", "types"],
    "packages/ansible-mcp-server/src/dependencyChecker.ts": ["exports"],
    "packages/ansible-mcp-server/src/resources/agents.ts": ["exports"],
    "packages/ansible-mcp-server/src/server.ts": ["exports"],
    "packages/ansible-mcp-server/src/tools/adeTools.ts": ["types", "exports"],
    "packages/ansible-mcp-server/src/tools/executionEnv.ts": ["types"],
  },
};

export default config;
