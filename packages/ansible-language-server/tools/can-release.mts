#!/usr/bin/env node
/**
 * Install the packed language server in an isolated project and run validate-ls.
 * Sets can_release_to_npm on GITHUB_OUTPUT when the check succeeds.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(toolsDir, "..");
const PROJECT_ROOT = resolve(toolsDir, "../../..");
const TEST_ALS = join(PROJECT_ROOT, "out", "test-als");

function run(cmd: string, args: string[], cwd: string): void {
  console.log(`Running ${cmd} ${args.join(" ")} in ${cwd}`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

function findAlsPackTarballs(): string[] {
  const outDir = join(PROJECT_ROOT, "out");
  return readdirSync(outDir)
    .filter(
      (name) =>
        name.startsWith("ansible-ansible-language-server-") &&
        name.endsWith(".tgz"),
    )
    .map((name) => join(outDir, name));
}

function main(): void {
  const packs = findAlsPackTarballs();
  if (packs.length === 0) {
    console.error(
      "No ansible-ansible-language-server-*.tgz found in out/; run task als:package first.",
    );
    process.exit(1);
  }

  mkdirSync(TEST_ALS, { recursive: true });
  run("git", ["init", "--initial-branch=main"], TEST_ALS);

  writeFileSync(
    join(TEST_ALS, "package.json"),
    `${JSON.stringify(
      {
        author: "your name",
        description: "Test als package",
        license: "N/A",
        main: "index.js",
        name: "test-als",
        repository: {
          type: "git",
          url: "the repositories url",
        },
        version: "0.0.1",
      },
      null,
      2,
    )}\n`,
  );

  run("npm", ["set", "audit", "false"], TEST_ALS);
  run("npm", ["add", "--verbose", ...packs], TEST_ALS);
  run("npm", ["install", "--no-fund", "--no-audit"], TEST_ALS);
  run("node", [join(PACKAGE_ROOT, "test", "validate-ls.ts")], TEST_ALS);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    console.error("Setting can_release_to_npm=true");
    appendFileSync(githubOutput, "can_release_to_npm=true\n");
  }
}

main();
