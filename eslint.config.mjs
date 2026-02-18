// @ts-check
// cspell: ignore tseslint
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import prettierRecommendedConfig from "eslint-plugin-prettier/recommended";
import globals from "globals";
import path from "path";
import { fileURLToPath } from "url";
import html from "@html-eslint/eslint-plugin";
import { defineConfig } from "eslint/config";
import { createRequire } from "module";
import importPlugin from "eslint-plugin-import";

const require = createRequire(import.meta.url);
const noUnsafeSpawnRule = require("./test/eslint/no-unsafe-spawn.cjs");

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export default defineConfig(
  {
    ignores: [
      "**/.mocharc.js",
      "**/.vscode-test/*",
      "**/coverage/**",
      "**/dist/",
      "**/out/",
      ".ansible/*",
      ".cache/*",
      ".trunk/*",
      ".venv/*",
      ".vscode-test/*",
      ".yarn/*",
      "commitlint.config.js",
      "media/walkthroughs/**/*.html",
      "site/*",
      "webviews/**",
      "test/unit/webviews/lightspeed/**",
      "test/unit/webviews/vitestSetup.ts",
    ],
  },
  {
    // Configuration for ESLint rule files (TypeScript)
    // Must come before TypeScript configs to override parser
    files: ["test/eslint/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2017,
      },
      // Use TypeScript parser for rule files, but without project for type checking
      // since rule files don't need full type checking
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      // Allow some TypeScript-specific rules for rule files, but disable strict ones
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  {
    // CommonJS rule file: Node globals (module, require, exports)
    files: ["test/eslint/**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "script",
      },
    },
  },
  importPlugin.flatConfigs.recommended,
  eslint.configs.recommended,
  prettierRecommendedConfig,
  tseslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: [
      "**/*.{js,ts,tsx}",
      "packages/**/*.{js,ts,tsx}",
      "test/**/*.{js,ts,tsx}",
    ],
  })),
  // Root .mjs config files: parse with TS parser but without project (not in tsconfig)
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2017,
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    files: [
      "**/*.{js,ts,tsx}",
      "packages/**/*.{js,ts,tsx}",
      "test/**/*.{js,ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
        ...globals.commonjs,
        ...globals.es2017,
      },
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      // loaded implicitly, will trigger 'Cannot redefine plugin' if enabled:
      // "@typescript-eslint": ts,
      "custom-rules": noUnsafeSpawnRule,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          name: "chai",
          message:
            "No direct import from chain, use vitest or node:assert alternatives.",
        },
      ],
      // temporary until we address these
      "import/enforce-node-protocol-usage": "off",
      // "import/no-unresolved": [
      //   "error",
      //   { commonjs: true, ignore: ["^vitest/config", "uuid"] },
      // ],
      "import/no-named-as-default-member": "off",
      // https://github.com/import-js/eslint-plugin-import/issues/3199
      eqeqeq: ["error", "smart"],
      // "import/no-relative-parent-imports": "warn",
      // Needed for tseslint.configs.strictTypeChecked
      "@typescript-eslint/no-namespace": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/prefer-literal-enum-member": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/only-throw-error": "off",
      "custom-rules/no-unsafe-spawn": "error",
      "no-case-declarations": "error",
      "no-constant-condition": "error",
      "no-control-regex": "error",
      "no-empty-function": "error",
      "no-prototype-builtins": "error",
      // "@typescript-eslint/require-await": "error",
      // "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/unbound-method": "error",
      // "@typescript-eslint/no-unsafe-member-access": "error",
      // "@typescript-eslint/no-floating-promises": "error",
      // "@typescript-eslint/restrict-template-expressions": "error",
      // "@typescript-eslint/no-unsafe-argument": "error",
      // "@typescript-eslint/no-unsafe-return": "error",
    },
    settings: {
      // workaround for vscode imports in test files
      "import/core-modules": ["vscode"],
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
    },
  },
  {
    // Special configuration for MCP server package
    files: ["packages/ansible-mcp-server/**/*.{js,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./packages/ansible-mcp-server/tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ["**/*.html"],
    plugins: {
      "@html-eslint": html,
    },
    rules: {
      ...html.configs["flat/recommended"].rules,
      "@html-eslint/indent": ["error", 2],
    },
  },
);
