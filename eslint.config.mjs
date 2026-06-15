// @ts-check
// cspell: ignore tseslint
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsParser from '@typescript-eslint/parser';
import prettierRecommendedConfig from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'eslint/config';
import { createRequire } from 'module';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import { includeIgnoreFile } from '@eslint/config-helpers';

const require = createRequire(import.meta.url);
// CJS local plugin has no TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- untyped CJS require
const eslintPluginLocal = /** @type {import('eslint').ESLint.Plugin} */ (
    require('./test/eslint/eslint-plugin-local.cjs')
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, '.gitignore');

export default defineConfig(
    includeIgnoreFile(gitignorePath, 'Imported .gitignore patterns'),
    ...[
        importPlugin.flatConfigs.recommended,
        eslint.configs.recommended,
        prettierRecommendedConfig,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
    ],
    {
        files: ['**/*.{js,mjs,ts,tsx,mts,cjs}'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.mocha,
                ...globals.es2022,
            },
            parser: tsParser,
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        '*.mjs',
                        '*.ts',
                        '.vscode-test.mjs',
                        'eslint.config.mjs',
                        'test/eslint/eslint-plugin-local.cjs',
                        'wdio.conf.ts',
                        'wdio.conf.wsl.ts',
                        'vitest.config.ts',
                    ],
                },
                tsconfigRootDir: __dirname,
            },
        },
        plugins: {
            local: eslintPluginLocal,
            jsdoc: jsdocPlugin,
        },
        rules: {
            eqeqeq: ['error', 'smart'],
            '@typescript-eslint/no-namespace': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/unbound-method': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/restrict-template-expressions': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            'local/node-DEP0190': 'error',
            'no-case-declarations': 'error',
            'no-constant-condition': 'error',
            'no-control-regex': 'error',
            'no-empty-function': 'error',
            'no-prototype-builtins': 'error',
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: false,
                        FunctionExpression: false,
                    },
                    checkConstructors: true,
                    checkGetters: true,
                    checkSetters: true,
                },
            ],
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/check-param-names': 'error',
            'jsdoc/check-tag-names': 'error',
            'jsdoc/no-types': 'error',
        },
        settings: {
            'import/core-modules': ['vscode'],
            'import/resolver': {
                typescript: { alwaysTryTypes: true },
            },
        },
    },
    {
        files: ['**/test/**/*.{js,ts,tsx,cjs}'],
        rules: {
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-base-to-string': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
        },
    },
    {
        files: ['test/ui/**/*.ts', 'wdio.conf.ts', 'wdio.conf.wsl.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-member-access': 'off',
        },
    },
    {
        files: ['src/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'chai',
                            message:
                                'No direct import from chai, use vitest or node:assert alternatives.',
                        },
                    ],
                    patterns: [
                        {
                            group: ['./*', '../*', '../../*', '../../../*', '../../../../*'],
                            message: 'Do not use relative imports; use @src/ path aliases instead.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['**/test/**/*.{js,ts,tsx,cjs}'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    {
        ignores: [
            'scripts/**',
            'src/panels/webview-entry.tsx',
            'src/panels/bridges/**',
            'src/panels/webview.d.ts',
            'packages/ui/vite.config.ts',
        ],
    },
    {
        files: ['**/*.{ts,tsx,mts}'],
        rules: { 'import/no-unresolved': 'off' },
    },
);
