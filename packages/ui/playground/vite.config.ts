import { defineConfig } from 'vite';
import { resolve } from 'path';

/** Dev-only app config for the sidebar NavTree fidelity spike. */
export default defineConfig({
    root: resolve(__dirname),
    server: {
        host: '127.0.0.1',
        port: 5174,
        open: false,
        strictPort: true,
    },
    build: {
        outDir: resolve(__dirname, '../dist-playground'),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'sidebar-navtree.html'),
        },
    },
});
