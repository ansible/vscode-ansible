#!/usr/bin/env node

/**
 * Run a command under xvfb-run on headless Linux when available.
 * On macOS and Windows, runs the command directly.
 */

import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/xvfb-run.mjs <command> [args...]");
  process.exit(2);
}

function resolveXvfbRun() {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    const xvfbRun = execFileSync("which", ["xvfb-run"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return xvfbRun || null;
  } catch {
    return null;
  }
}

const xvfbRun = resolveXvfbRun();
const command = xvfbRun ?? args[0];
const commandArgs = xvfbRun ? ["--auto-servernum", ...args] : args.slice(1);

const result = spawnSync(command, commandArgs, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
