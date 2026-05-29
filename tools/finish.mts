#!/usr/bin/env node
// Keep the .mts extension so Node executes this as ESM (see tools/helper.mts).
/**
 * Commands to run at the end of build and test processes:
 * - ensure `vitest list` works without stderr warnings (non-Windows only)
 * - ensure the working tree has no unexpected changes
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = "out/log";
const VITEST_STDOUT = join(LOG_DIR, "vitest-list-stdout.txt");
const VITEST_STDERR = join(LOG_DIR, "vitest-list-stderr.txt");
const RED = "\x1b[0;31m";
const NC = "\x1b[0m";

function assertVitestListIsClean(): void {
  if (process.platform === "win32") {
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });

  const result = spawnSync("npm", ["exec", "--", "vitest", "list"], {
    encoding: "utf8",
  });
  const stderr = (result.stderr ?? "").trim();
  const stdout = (result.stdout ?? "").trim();

  writeFileSync(VITEST_STDOUT, stdout);
  writeFileSync(VITEST_STDERR, stderr);

  if (result.status !== 0 || stderr.length > 0) {
    console.error(
      `Failing because 'vitest list' (exit code ${result.status}) should not produce any warnings: '${stderr}'`,
    );
    process.stderr.write(readFileSync(VITEST_STDERR, "utf8"));
    process.exit(5);
  }
}

function assertCleanWorkingTree(): void {
  if (process.env.VSCODE_INJECTION === "1") {
    return;
  }

  try {
    execSync("git diff --quiet --exit-code", { stdio: "ignore" });
  } catch {
    console.error(
      `${RED}ERROR: Found files either untracked missing from .gitignore or modified and tracked:${NC}`,
    );
    execSync("git ls-files --exclude-standard --others", {
      stdio: ["ignore", "inherit", "inherit"],
    });
    execSync("git -P diff --color=always", { stdio: "inherit" });
    process.exit(1);
  }
}

function main(): void {
  assertVitestListIsClean();
  assertCleanWorkingTree();
}

main();
