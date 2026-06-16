import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: 'coverage',
            include: [
                'packages/common/src/**/*.ts',
                'packages/services/src/**/*.ts',
                'packages/mcp-server/src/**/*.ts',
            ],
            exclude: ['**/index.ts', '**/server.ts', '**/types/**'],
            thresholds: {
                statements: 85,
                branches: 75,
                functions: 85,
                lines: 85,
            },
        },
        projects: [
            {
                test: {
                    name: 'common',
                    root: 'packages/common',
                    include: ['test/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'services',
                    root: 'packages/services',
                    include: ['test/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'mcp',
                    root: 'packages/mcp-server',
                    include: ['test/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'ls',
                    root: 'packages/language-server',
                    include: ['test/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'ui',
                    root: 'packages/ui',
                    include: ['test/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'ext',
                    include: ['test/unit/**/*.test.ts'],
                    environment: 'node',
                },
            },
        ],
    },
});
