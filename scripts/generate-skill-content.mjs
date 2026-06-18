#!/usr/bin/env node
/**
 * Generates .content.ts sidecar files from .md skill files.
 *
 * Each .md file in packages/common/src/skills/ gets a corresponding
 * .content.ts that exports the markdown as a default string. This
 * allows tsc, esbuild, and vitest to import skill content without
 * special loaders.
 *
 * The .md files remain the source of truth (skillmark-lintable).
 * Run this script whenever a .md file is added or changed.
 */

import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'packages', 'common', 'src', 'skills');
const HEADER = '// AUTO-GENERATED from adjacent .md file — do not edit directly.\n';

for (const f of readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.content.ts'))) {
    unlinkSync(join(SKILLS_DIR, f));
}

const mdFiles = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md')).sort();
let count = 0;

for (const md of mdFiles) {
    const content = readFileSync(join(SKILLS_DIR, md), 'utf-8').replace(/\r\n/g, '\n');
    const tsName = md.replace(/\.md$/, '.content.ts');
    const hasApostrophe = content.includes("'");
    const q = hasApostrophe ? '"' : "'";
    const escaped = content
        .replace(/\\/g, '\\\\')
        .replace(hasApostrophe ? /"/g : /'/g, hasApostrophe ? '\\"' : "\\'")
        .replace(/\n/g, '\\n');
    writeFileSync(
        join(SKILLS_DIR, tsName),
        `${HEADER}export default ${q}${escaped}${q};\n`,
    );
    count++;
}

console.log(`Generated ${count} .content.ts sidecar files`);
