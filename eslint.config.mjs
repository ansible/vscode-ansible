// @ts-check
// cspell: ignore tseslint
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import tsdocPlugin from "eslint-plugin-tsdoc";
import prettierRecommendedConfig from "eslint-plugin-prettier/recommended";
import pluginChaiFriendly from "eslint-plugin-chai-friendly";
import globals from "globals";
import path from "path";
import { fileURLToPath } from "url";
import html from "@html-eslint/eslint-plugin";
import { defineConfig } from "eslint/config";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const noUnsafeSpawnRule =
  require("./out/client/test/eslint/no-unsafe-spawn.js").default;

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
      ".cache/*",
      ".trunk/*",
      ".venv/*",
      ".vscode-test/*",
      ".yarn/*",
      "commitlint.config.js",
      "media/walkthroughs/**/*.html",
      "site/*",
      "webviews/**",
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
      tsdoc: tsdocPlugin,
      "custom-rules": noUnsafeSpawnRule,
    },
    rules: {
      eqeqeq: ["error", "smart"],
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
      "tsdoc/syntax": "error",
      // "@typescript-eslint/require-await": "error",
      // "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/unbound-method": "error",
      // "@typescript-eslint/no-unsafe-member-access": "error",
      // "@typescript-eslint/no-floating-promises": "error",
      // "@typescript-eslint/restrict-template-expressions": "error",
      // "@typescript-eslint/no-unsafe-argument": "error",
      // "@typescript-eslint/no-unsafe-return": "error",
    },
  },
  {
    plugins: { "chai-friendly": pluginChaiFriendly },
    files: ["**/test/**/*.{js,ts,tsx}"],
    rules: {
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-require-imports": "off",
      "chai-friendly/no-unused-expressions": "error",
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
