// @ts-check
// cspell: ignore tseslint
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import ts from "@typescript-eslint/eslint-plugin";
import tsdocPlugin from "eslint-plugin-tsdoc";
import prettierRecommendedConfig from "eslint-plugin-prettier/recommended";
import globals from "globals";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export default tseslint.config(
  {
    ignores: ["**/out/", ".yarn/*", "media/*"],
  },
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      prettierRecommendedConfig,
    ],
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
      "@typescript-eslint": ts,
      tsdoc: tsdocPlugin,
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "tsdoc/syntax": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-namespace": "error",
      "@typescript-eslint/no-unused-vars": "error",
      // Fix temporary off/warn made during eslint v9 upgrade:
      "@typescript-eslint/no-non-null-assertion": "warn",
      "no-empty-function": "warn",
      "no-case-declarations": "off",
      "no-constant-condition": "off",
      "no-control-regex": "off",
      "no-prototype-builtins": "off",
    },
  },
);
