#!/usr/bin/env node
// @ts-check
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Copy vendored EE introspection scripts into dist/data for runtime lookup. */
function copyVendoredData() {
    const srcDir = path.join(ROOT, 'packages', 'services', 'src', 'data');
    const destDir = path.join(ROOT, 'dist', 'data');
    const files = ['image_introspect.py', 'python_latest.sh', 'NOTICE'];
    fs.mkdirSync(destDir, { recursive: true });
    const missing = [];
    for (const file of files) {
        const src = path.join(srcDir, file);
        if (!fs.existsSync(src)) {
            missing.push(file);
            continue;
        }
        fs.copyFileSync(src, path.join(destDir, file));
    }
    if (missing.length > 0) {
        console.error(
            `[build] ERROR: missing vendored EE scripts in ${srcDir}: ${missing.join(', ')}`,
        );
        process.exitCode = 1;
        return;
    }
    console.log('[build] copied vendored EE scripts → dist/data');
}

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {esbuild.BuildOptions} */
const shared = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    sourcemap: !production,
    minify: production,
    metafile: true,
    logLevel: 'info',
    outdir: path.join(ROOT, 'dist'),
};

/** @type {esbuild.BuildOptions} */
const webviewShared = {
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: !production,
    minify: production,
    metafile: true,
    logLevel: 'info',
    outdir: path.join(ROOT, 'dist'),
    jsx: 'automatic',
    jsxImportSource: 'react',
    loader: { '.css': 'text' },
};

/** @type {esbuild.BuildOptions[]} */
const targets = [
    {
        ...shared,
        entryPoints: [path.join(ROOT, 'src', 'extension.ts')],
        outfile: path.join(ROOT, 'dist', 'extension.js'),
        outdir: undefined,
        external: ['vscode'],
        alias: {
            '@src': path.join(ROOT, 'src'),
            '@ansible/common': path.join(ROOT, 'packages', 'common', 'src'),
            '@ansible/lightspeed': path.join(ROOT, 'packages', 'lightspeed', 'src'),
            '@ansible/mcp-server': path.join(ROOT, 'packages', 'mcp-server', 'src'),
            '@ansible/developer-services': path.join(ROOT, 'packages', 'services', 'src'),
        },
    },
    {
        ...shared,
        entryPoints: [path.join(ROOT, 'packages', 'language-server', 'src', 'cli.ts')],
        outfile: path.join(ROOT, 'dist', 'language-server.js'),
        outdir: undefined,
        alias: {
            '@src': path.join(ROOT, 'packages', 'language-server', 'src'),
            '@ansible/developer-services': path.join(ROOT, 'packages', 'services', 'src'),
            '@ansible/common': path.join(ROOT, 'packages', 'common', 'src'),
        },
    },
    {
        ...shared,
        entryPoints: [path.join(ROOT, 'packages', 'mcp-server', 'src', 'server.ts')],
        outfile: path.join(ROOT, 'dist', 'mcp-server.js'),
        outdir: undefined,
        alias: {
            '@src': path.join(ROOT, 'packages', 'mcp-server', 'src'),
            '@ansible/developer-services': path.join(ROOT, 'packages', 'services', 'src'),
            '@ansible/common': path.join(ROOT, 'packages', 'common', 'src'),
        },
    },
    {
        ...webviewShared,
        entryPoints: [path.join(ROOT, 'src', 'panels', 'webview-entry.tsx')],
        outfile: path.join(ROOT, 'dist', 'webview.js'),
        outdir: undefined,
        alias: {
            '@src': path.join(ROOT, 'src'),
            '@ansible/ui': path.join(ROOT, 'packages', 'ui', 'src'),
            '@ansible/common': path.join(ROOT, 'packages', 'common', 'src'),
        },
    },
];

async function main() {
    if (watch) {
        const contexts = await Promise.all(targets.map((t) => esbuild.context(t)));
        await Promise.all(contexts.map((ctx) => ctx.watch()));
        copyVendoredData();
        console.log('[build] watching for changes…');
    } else {
        const results = await Promise.all(targets.map((t) => esbuild.build(t)));
        for (const result of results) {
            const outputs = Object.keys(result.metafile?.outputs ?? {});
            for (const out of outputs) {
                const bytes = result.metafile?.outputs[out]?.bytes ?? 0;
                console.log(`  ${out}: ${(bytes / 1024).toFixed(1)} KB`);
            }
        }
        copyVendoredData();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
