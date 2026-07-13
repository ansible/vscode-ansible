#!/usr/bin/env node

/**
 * Print a categorized, described list of package scripts.
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
    "test:integration": "VS Code integration tests (xvfb on headless Linux)",
    "test:ui": "WebDriverIO UI tests (xvfb on headless Linux)",
    "test:lightspeed": "Lightspeed unit tests",
    "test:lightspeed:ui": "Lightspeed WebDriverIO UI tests (xvfb on headless Linux)",
    "pretest:wdio": "Install Chromedriver and test dependency extensions",
    "test:story-coverage": "User story WDIO coverage report (threshold gate)",
  }],
  ["Linting", {
    lint: "All linters via prek (eslint, knip, cspell, markdownlint, etc.)",
    "lint:eslint": "Run ESLint via prek hook",
    "lint:knip": "Find unused files, deps, and exports (via prek hook)",
  }],
  ["Quality Gates", {
    check: "compile + lint + test (iterative development)",
    ci: "Full CI: compile + lint (prek) + test:coverage + build",
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

console.log(`\n  Run: pnpm run <name>      Full CI gate: pnpm run ci`);
