#!/usr/bin/env node
/**
 * Computes user-story coverage from WDIO spec @covers tags.
 *
 * Reads .sdlc/user-stories.yaml for the canonical story list, scans
 * all WDIO spec files for @covers annotations, cross-references them,
 * and emits a markdown summary. Exits non-zero if coverage drops below
 * the configured threshold.
 *
 * Usage:
 *   node scripts/story-coverage.mjs [--threshold 20] [--output report.md] [--lcov coverage/stories.lcov]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORIES_PATH = join(ROOT, '.sdlc', 'user-stories.yaml');

const SPEC_GLOBS = [
    join(ROOT, 'test', 'ui'),
    join(ROOT, 'packages', 'lightspeed', 'test', 'wdio'),
];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let threshold = 20;
let outputPath = '';
let lcovPath = '';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' && args[i + 1]) {
        threshold = Number(args[++i]);
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
            console.error(`Invalid --threshold value: must be a number between 0 and 100`);
            process.exit(1);
        }
    } else if (args[i] === '--output' && args[i + 1]) {
        outputPath = args[++i];
    } else if (args[i] === '--lcov' && args[i + 1]) {
        lcovPath = args[++i];
    }
}

// ---------------------------------------------------------------------------
// Load stories
// ---------------------------------------------------------------------------

const yamlText = readFileSync(STORIES_PATH, 'utf-8');
const catalog = parseYaml(yamlText);

if (!catalog?.stories?.length) {
    console.error('No stories found in', STORIES_PATH);
    process.exit(1);
}

/** @type {Map<string, { title: string, requires_ai: boolean }>} */
const storyMap = new Map();
for (const s of catalog.stories) {
    storyMap.set(s.id, {
        title: s.title,
        requires_ai: s.requires_ai ?? false,
    });
}

// ---------------------------------------------------------------------------
// Scan spec files for @covers tags
// ---------------------------------------------------------------------------

/**
 * Recursively collects .spec.ts files from a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectSpecs(dir) {
    const results = [];
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            results.push(...collectSpecs(full));
        } else if (entry.endsWith('.spec.ts')) {
            results.push(full);
        }
    }
    return results;
}

const COVERS_RE = /@covers\s+([\w-]+)/g;

/** @type {Map<string, Set<string>>} story ID -> set of spec files */
const coverageMap = new Map();

/** @type {Map<string, Set<string>>} spec file -> set of story IDs */
const specMap = new Map();

const allSpecs = SPEC_GLOBS.flatMap(collectSpecs);

for (const specPath of allSpecs) {
    const content = readFileSync(specPath, 'utf-8');
    const relPath = relative(ROOT, specPath);
    const matches = [...content.matchAll(COVERS_RE)];

    if (matches.length === 0) continue;

    const storyIds = new Set(matches.map((m) => m[1]));
    specMap.set(relPath, storyIds);

    for (const id of storyIds) {
        if (!coverageMap.has(id)) {
            coverageMap.set(id, new Set());
        }
        coverageMap.get(id).add(relPath);
    }
}

// ---------------------------------------------------------------------------
// Compute coverage
// ---------------------------------------------------------------------------

const covered = [];
const uncovered = [];
const unknownTags = [];

for (const [id, meta] of storyMap) {
    if (coverageMap.has(id)) {
        covered.push({ id, ...meta, specs: [...coverageMap.get(id)] });
    } else {
        uncovered.push({ id, ...meta });
    }
}

for (const id of coverageMap.keys()) {
    if (!storyMap.has(id)) {
        unknownTags.push(id);
    }
}

const total = storyMap.size;
const coveredCount = covered.length;
const pct = total > 0 ? Math.round((coveredCount / total) * 100) : 0;

// ---------------------------------------------------------------------------
// Build report
// ---------------------------------------------------------------------------

const lines = [];

lines.push('# User Story Coverage Report');
lines.push('');
lines.push(`**Coverage: ${coveredCount}/${total} stories (${pct}%)**`);
lines.push(`**Threshold: ${threshold}%**`);
lines.push('');

if (covered.length > 0) {
    lines.push('## Covered stories');
    lines.push('');
    lines.push('| Story | Title | Spec files |');
    lines.push('|-------|-------|------------|');
    for (const s of covered.sort((a, b) => a.id.localeCompare(b.id))) {
        lines.push(`| ${s.id} | ${s.title} | ${s.specs.join(', ')} |`);
    }
    lines.push('');
}

if (uncovered.length > 0) {
    lines.push('## Uncovered stories');
    lines.push('');
    lines.push('| Story | Title | Requires AI |');
    lines.push('|-------|-------|-------------|');
    for (const s of uncovered.sort((a, b) => a.id.localeCompare(b.id))) {
        lines.push(`| ${s.id} | ${s.title} | ${s.requires_ai ? 'yes' : 'no'} |`);
    }
    lines.push('');
}

if (unknownTags.length > 0) {
    lines.push('## Unknown @covers tags');
    lines.push('');
    lines.push('These tags appear in spec files but have no matching story:');
    lines.push('');
    for (const id of unknownTags.sort()) {
        lines.push(`- \`${id}\``);
    }
    lines.push('');
}

if (specMap.size > 0) {
    lines.push('## Spec file index');
    lines.push('');
    lines.push('| Spec file | Stories covered |');
    lines.push('|-----------|----------------|');
    for (const [spec, ids] of [...specMap].sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`| ${spec} | ${[...ids].sort().join(', ')} |`);
    }
    lines.push('');
}

const report = lines.join('\n');

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log(report);

if (outputPath) {
    writeFileSync(outputPath, report, 'utf-8');
    console.log(`Report written to ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Synthetic lcov for Codecov (optional)
// ---------------------------------------------------------------------------

if (lcovPath) {
    const lcovDir = dirname(lcovPath);
    mkdirSync(lcovDir, { recursive: true });

    const sortedStories = [...storyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    // Codecov requires the SF path to reference a file in the git tree.
    // This file is committed and regenerated by this script.
    const sourcePath = join(ROOT, '.sdlc', 'user-stories.coverage.txt');
    const sourceLines = sortedStories.map(([id, meta]) => `${id}: ${meta.title}`);
    writeFileSync(sourcePath, sourceLines.join('\n') + '\n', 'utf-8');

    const lcovLines = [`TN:user-story-coverage`, `SF:${relative(ROOT, sourcePath)}`];
    let linesHit = 0;
    for (let i = 0; i < sortedStories.length; i++) {
        const hit = coverageMap.has(sortedStories[i][0]) ? 1 : 0;
        linesHit += hit;
        lcovLines.push(`DA:${i + 1},${hit}`);
    }
    lcovLines.push(`LF:${sortedStories.length}`);
    lcovLines.push(`LH:${linesHit}`);
    lcovLines.push('end_of_record');

    writeFileSync(lcovPath, lcovLines.join('\n') + '\n', 'utf-8');
    console.log(`Synthetic lcov written to ${lcovPath}`);
    console.log(`Source file written to ${sourcePath}`);
}

if (pct < threshold) {
    console.error(
        `\nCoverage ${pct}% is below threshold ${threshold}%. ` +
            `Add WDIO tests with @covers tags for uncovered stories.`,
    );
    process.exit(1);
}

console.log(`\nCoverage ${pct}% meets threshold ${threshold}%.`);
