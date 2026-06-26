#!/usr/bin/env node
/**
 * Generates .content.ts sidecar files from SKILL.md skill files.
 *
 * Each skills/{name}/SKILL.md at the repo root gets a corresponding
 * .content.ts in packages/common/src/skills/ that exports the markdown
 * as a default string. This allows tsc, esbuild, and vitest to import
 * skill content without special loaders.
 *
 * The SKILL.md files remain the source of truth.
 * Run this script whenever a SKILL.md file is added or changed.
 */

import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_SRC = join(ROOT, 'skills');
const OUTPUT_DIR = join(ROOT, 'packages', 'common', 'src', 'skills');
const HEADER = '// AUTO-GENERATED from skills/*/SKILL.md — do not edit directly.\n';

for (const f of readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.content.ts'))) {
    unlinkSync(join(OUTPUT_DIR, f));
}

const skillDirs = readdirSync(SKILLS_SRC)
    .filter((d) => statSync(join(SKILLS_SRC, d)).isDirectory())
    .sort();
let count = 0;

for (const dir of skillDirs) {
    const mdPath = join(SKILLS_SRC, dir, 'SKILL.md');
    try {
        const content = readFileSync(mdPath, 'utf-8').replace(/\r\n/g, '\n');
        const tsName = `${dir}.content.ts`;
        const hasApostrophe = content.includes("'");
        const q = hasApostrophe ? '"' : "'";
        const escaped = content
            .replace(/\\/g, '\\\\')
            .replace(hasApostrophe ? /"/g : /'/g, hasApostrophe ? '\\"' : "\\'")
            .replace(/\n/g, '\\n');
        writeFileSync(
            join(OUTPUT_DIR, tsName),
            `${HEADER}export default ${q}${escaped}${q};\n`,
        );
        count++;
    } catch (err) {
        if (err?.code === 'ENOENT') continue;
        throw err;
    }
}

console.log(`Generated ${count} .content.ts sidecar files from skills/*/SKILL.md`);
