#!/usr/bin/env node
import { execFileSync } from "node:child_process";

/** Prefix for headless Linux CI when xvfb-run is available (see Taskfile XVFB). */
function main(): void {
  if (process.platform !== "linux") {
    return;
  }

  try {
    const xvfbRun = execFileSync("which", ["xvfb-run"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (xvfbRun) {
      // Trailing space is required when prepended to test commands.
      process.stdout.write(`${xvfbRun} --auto-servernum -e out/log/xvfb.log `);
    }
  } catch {
    // xvfb-run not installed
  }
}

main();
