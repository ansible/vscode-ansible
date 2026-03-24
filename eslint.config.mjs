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
/** @type {import('eslint').Linter.Plugin} */
const eslintPluginLocal = require("./test/eslint/eslint-plugin-local.cjs");

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default defineConfig(
  includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
  {
    ignores: [
      "**/dist/**/*",
      "**/lib/**/*",
      "packages/**/tsup.config.ts",
      // do not add ignores here, .yarn is special case as is not our code
      ".yarn/*",
      ".venv/*",
      // TODO: remove
      "media/walkthroughs/**/*.html",
      "webviews/**/*.html",
      // TODO: remove once we go full ESM
      "vite.config.mts",
      "test/unit/viteConfig.test.ts",
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
          paths: [
            {
              name: "chai",
              message:
                "No direct import from chai, use vitest or node:assert alternatives.",
            },
          ],
          patterns: [
            {
              group: ["./*", "../*", "../../*", "../../../*", "../../../../*"],
              message:
                "Do not use relative imports; use path aliases or absolute imports.",
            },
          ],
        },
      ],
      // temporary until we address these
      // https://github.com/import-js/eslint-plugin-import/issues/3199
      eqeqeq: ["error", "smart"],
      // "import/no-relative-parent-imports": "warn",
      // Needed for tseslint.configs.strictTypeChecked
      "@typescript-eslint/no-namespace": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-require-imports": "off",
      "local/node-DEP0190": "error",
      "no-case-declarations": "error",
      "no-constant-condition": "error",
      "no-control-regex": "error",
      "no-empty-function": "error",
      "no-prototype-builtins": "error",
      // "@typescript-eslint/require-await": "error",  // electron import
      // "@typescript-eslint/await-thenable": "error", // ~58 errors
      "@typescript-eslint/unbound-method": "error",
      // "@typescript-eslint/no-unsafe-member-access": "error", // ~550 errors
      // "@typescript-eslint/no-floating-promises": "error", // ~100 errors
      // "@typescript-eslint/restrict-template-expressions": "error",
      // "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-return": "error",
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
    files: ["**/test/**/*.{js,ts,tsx,cjs}"],
    rules: {
      // unbound-method is noisy (expect(mock.method).toHaveBeenCalledWith etc.
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-base-to-string": "off",
      // Mocks and dynamic fixtures routinely return `any`
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    // Package code uses @src/@test aliases resolved by tsconfig/Vitest per package; ESLint uses root
    files: ["packages/**/*.{js,ts,tsx}"],
    rules: { "import/no-unresolved": "off" },
  },
);
