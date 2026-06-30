import { defineConfig, type UserProjectConfigExport } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));

const sharedResolve = {
    alias: {
        '@ansible/common': resolve(ROOT, 'packages/common/src'),
        '@ansible/services': resolve(ROOT, 'packages/services/src'),
    },
};

/**
 * Build a project config with shared resolve aliases.
 *
 * @param name - Project name for vitest output.
 * @param root - Package root directory relative to workspace.
 * @param include - Glob patterns for test file discovery.
 * @returns Vitest project config with package aliases.
 */
function project(name: string, root: string, include: string[]): UserProjectConfigExport {
    return {
        resolve: sharedResolve,
        test: {
            name,
            root,
            include,
            environment: 'node',
        },
    };
}

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'cobertura'],
            reportsDirectory: 'coverage',
            all: true,
            include: [
                'src/**/*.ts',
                'packages/common/src/**/*.ts',
                'packages/services/src/**/*.ts',
                'packages/language-server/src/**/*.ts',
                'packages/mcp-server/src/**/*.ts',
                'packages/ui/src/**/*.ts',
                'packages/lightspeed/src/**/*.ts',
            ],
            exclude: ['**/index.ts', '**/server.ts', '**/types/**'],
            thresholds: {
                statements: 45,
                branches: 75,
                functions: 80,
                lines: 45,
            },
        },
        projects: [
            project('common', 'packages/common', ['test/**/*.test.ts']),
            project('services', 'packages/services', ['test/**/*.test.ts']),
            project('mcp', 'packages/mcp-server', ['test/**/*.test.ts']),
            project('ls', 'packages/language-server', ['test/**/*.test.ts']),
            project('ui', 'packages/ui', ['test/**/*.test.ts']),
            project('lightspeed', 'packages/lightspeed', ['test/**/*.test.ts']),
            {
                resolve: {
                    alias: {
                        ...sharedResolve.alias,
                        '@src': resolve(ROOT, 'src'),
                    },
                },
                test: {
                    name: 'ext',
                    include: ['test/unit/**/*.test.ts'],
                    environment: 'node',
                },
            },
        ],
    },
});
