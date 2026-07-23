#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

declare const PACKAGE_VERSION: string;

/**
 * CLI entry logic. Returns a process exit code instead of calling
 * `process.exit`, so unit tests can exercise branches without killing the
 * Vitest worker.
 *
 * @param argv - Arguments after the node/binary path (like `process.argv.slice(2)`).
 * @returns Exit code (0 success, non-zero failure).
 */
export async function run(argv: string[]): Promise<number> {
  const args = new Set(argv);

  if (args.has("--version")) {
    console.log(PACKAGE_VERSION);
    return 0;
  }

  if (args.has("--generate-docs")) {
    const outputPath = argv[argv.indexOf("--generate-docs") + 1];
    if (!outputPath || outputPath.startsWith("--")) {
      console.error(
        "Usage: ansible-language-server --generate-docs <output-md-file>",
      );
      return 1;
    }
    try {
      const { generateSettingsDocs } =
        await import("@src/settings-doc-generator");
      generateSettingsDocs(outputPath);
    } catch (err: unknown) {
      console.error(err);
      return 1;
    }
    return 0;
  }

  try {
    await import("./server.js");
  } catch (err: unknown) {
    console.error(err);
    return 1;
  }
  return 0;
}

/** Canonical path of this module (src/cli.ts or dist/cli.cjs depending on build). */
const thisModulePath = fileURLToPath(import.meta.url);
const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun =
  entryArg === thisModulePath ||
  // npm/pnpm bin shim may invoke the package name rather than the file path
  path.basename(entryArg) === "ansible-language-server";

if (isDirectRun) {
  void run(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
