#!/usr/bin/env node

/**
 * Print a categorized, described list of npm scripts.
 *
 * Keep this map in sync with package.json — the audit-npm-scripts
 * agent skill checks for drift automatically.
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const catalog = [
  ["Build & Development", {
    compile: "TypeScript compilation (includes skill codegen)",
    build: "esbuild production bundle (extension + LS + MCP)",
    "build:production": "esbuild bundle with minification",
    watch: "TypeScript watch mode",
    "watch:bundle": "esbuild watch mode",
  }],
  ["Testing", {
    test: "Run all unit tests (vitest)",
    "test:coverage": "Unit tests with coverage thresholds",
    "test:watch": "Unit tests in watch mode",
    "test:integration": "VS Code integration tests",
    "test:ui": "WebDriverIO UI tests (smoke + language server)",
    "test:lightspeed": "Lightspeed unit tests",
    "test:lightspeed:ui": "Lightspeed WebDriverIO UI tests",
  }],
  ["Linting", {
    lint: "ESLint on the full project",
    "lint:prek": "prek hooks (skillmark, cspell, markdownlint, actionlint)",
    "lint:knip": "Find unused files, deps, and exports (knip)",
  }],
  ["Quality Gates", {
    check: "compile + lint + test (iterative development)",
    ci: "Full CI: compile + lint + prek + knip + test:coverage + build",
  }],
  ["Packaging", {
    package: "Create .vsix package",
    "package:install": "Package, install in VS Code, clean up",
  }],
  ["Documentation", {
    "docs:dev": "Start docs dev server (Starlight)",
    "docs:build": "Build docs site for production",
    "docs:preview": "Preview built docs site",
  }],
  ["Webviews", {
    "build:lightspeed:webviews": "Build Lightspeed Vue webviews",
  }],
  ["Utilities", {
    help: "Show this help message",
    "deps:check": "Show outdated packages and audit vulnerabilities",
  }],
];

const documented = new Set();

for (const [category, scripts] of catalog) {
  console.log(`\n  \x1b[1m${category}\x1b[0m`);
  for (const [name, desc] of Object.entries(scripts)) {
    if (!pkg.scripts[name]) continue;
    documented.add(name);
    console.log(`    ${name.padEnd(26)} ${desc}`);
  }
}

const undocumented = Object.keys(pkg.scripts).filter(
  (s) => !documented.has(s) && !s.startsWith("pre") && s !== "vscode:prepublish",
);
if (undocumented.length > 0) {
  console.log(`\n  \x1b[2mUndocumented\x1b[0m`);
  for (const s of undocumented) {
    console.log(`    ${s.padEnd(26)} ${pkg.scripts[s]}`);
  }
}

console.log(`\n  Run: npm run <name>       Full CI gate: npm run ci`);
