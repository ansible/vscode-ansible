#!/usr/bin/env node
/**
 * Verify ALS files inside a built VSIX and smoke-run the packaged CLI.
 *
 * Local re-run (after `task package`):
 *   node tools/smoke-als-vsix.mts
 *   node tools/smoke-als-vsix.mts --vsix out/ansible-<version>.vsix
 */
import { join } from "node:path";
import {
  assertAlsDistInExtensionRoot,
  extractVsixExtensionRoot,
  findSingleVsix,
  smokeAlsCli,
} from "./als-packaging.mts";

const projectRoot = join(import.meta.dirname, "..");

function parseVsixArg(argv: string[]): string | undefined {
  const idx = argv.indexOf("--vsix");
  if (idx === -1) {
    return undefined;
  }
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("Usage: smoke-als-vsix.mts [--vsix path/to/ansible.vsix]");
  }
  return value;
}

async function main(): Promise<void> {
  const vsixPath =
    parseVsixArg(process.argv.slice(2)) ??
    findSingleVsix(join(projectRoot, "out"));

  const { extensionRoot, cleanup } = extractVsixExtensionRoot(vsixPath);
  try {
    assertAlsDistInExtensionRoot(extensionRoot);
    const cliPath = join(
      extensionRoot,
      "packages",
      "ansible-language-server",
      "dist",
      "cli.cjs",
    );
    await smokeAlsCli(cliPath, extensionRoot);
    console.log(`ALS VSIX packaging smoke passed (${vsixPath})`);
  } finally {
    cleanup();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
