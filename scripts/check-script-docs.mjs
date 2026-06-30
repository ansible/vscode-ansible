#!/usr/bin/env node

/**
 * Verify that every non-lifecycle script in package.json has a
 * description in scripts/help.mjs, and vice versa. Exits non-zero
 * on drift so prek can enforce sync on commit.
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const helpSrc = readFileSync("scripts/help.mjs", "utf-8");

const lifecyclePrefixes = ["pre", "post", "vscode:"];
const isLifecycle = (name) =>
  lifecyclePrefixes.some((p) => name.startsWith(p));

const scriptNames = Object.keys(pkg.scripts || {}).filter(
  (s) => !isLifecycle(s),
);

// Extract script names documented in the catalog object literals.
// Matches both quoted keys ("build:production":) and unquoted (compile:).
const documentedInHelp = new Set();

// Match: key: "description" where key is bare or quoted
const entryRegex =
  /(?:^|[{,\s])(?:"([a-z][\w:./-]*)"|'([a-z][\w:./-]*)'|([a-z]\w*))\s*:\s*"/gm;
for (const match of helpSrc.matchAll(entryRegex)) {
  const name = match[1] ?? match[2] ?? match[3];
  documentedInHelp.add(name);
}

// These are structural keys in help.mjs, not script names
for (const k of ["category", "scripts", "name", "desc"]) {
  documentedInHelp.delete(k);
}

const errors = [];

for (const name of scriptNames) {
  if (!documentedInHelp.has(name)) {
    errors.push(`Missing from help.mjs: "${name}"`);
  }
}

for (const name of documentedInHelp) {
  if (!pkg.scripts[name]) {
    errors.push(`In help.mjs but not in package.json: "${name}"`);
  }
}

if (errors.length > 0) {
  console.error("Script documentation drift detected:\n");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  console.error(
    "\nUpdate scripts/help.mjs to match package.json scripts.",
  );
  process.exit(1);
}
