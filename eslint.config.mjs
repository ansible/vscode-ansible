// @ts-check
// cspell: ignore tseslint
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import prettierRecommendedConfig from "eslint-plugin-prettier/recommended";
import globals from "globals";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "eslint/config";
import { createRequire } from "module";
import importPlugin from "eslint-plugin-import";
import { includeIgnoreFile } from "@eslint/compat";
const require = createRequire(import.meta.url);
const eslintPluginLocal = require("./test/eslint/eslint-plugin-local.cjs");

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default defineConfig(
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  {
    ignores: [
      // do not add ignores here, .yarn is special case as is not our code
      ".yarn/*",
      ".venv/*",
      // TODO: remove
      "media/walkthroughs/**/*.html",
      "webviews/**/*.html",
    ],
  },
  ...[
    importPlugin.flatConfigs.recommended,
    eslint.configs.recommended,
    prettierRecommendedConfig,
    tseslint.configs.recommended,
    tseslint.configs.strict,
    // TODO: enable later
    // tseslint.configs.stylistic,
  ],
  {
    // .mjs files (e.g. .vscode-test.mjs): TS parser without project (not in tsconfig)
    files: ["**/*.mjs", ".*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: { "import/no-unresolved": "off" },
  },
  {
    /** Files that use type-aware linting (TS/JS in src, packages, test). */
    files: [
      "**/*.{js,ts,tsx}",
      "packages/**/*.{js,ts,tsx}",
      "test/**/*.{js,ts,tsx,cjs}",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
        ...globals.commonjs,
        ...globals.es2022,
      },
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      local: eslintPluginLocal,
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
      "@typescript-eslint/no-base-to-string": "error",
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
      "local/no-unsafe-spawn": "error",
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
    // Test files rules are more relaxed for convenience
    files: ["**/test/**/*.{js,ts,tsx}"],
    rules: {
      // unbound-method is noisy (expect(mock.method).toHaveBeenCalledWith etc.
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
);
