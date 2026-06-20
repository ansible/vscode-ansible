import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
    base: './',
    build: {
        emptyOutDir: true,
        minify: false,
        outDir: 'dist/webviews',
        modulePreload: false,
        rollupOptions: {
            input: {
                explanation: path.resolve(__dirname, 'webviews/explanation.html'),
                'playbook-generation': path.resolve(__dirname, 'webviews/playbook-generation.html'),
                'role-generation': path.resolve(__dirname, 'webviews/role-generation.html'),
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name][extname]',
            },
        },
    },
    plugins: [
        vue({
            template: {
                compilerOptions: {
                    isCustomElement: (tag: string) => tag.startsWith('vscode-'),
                },
            },
        }),
    ],
    resolve: {
        alias: {
            '@webviews': path.resolve(__dirname, 'webviews'),
        },
    },
});
