#!/usr/bin/env node
/**
 * Converts multiple lcov.info files into a single cobertura-compatible XML file
 * while being able to remove some extra folders from the source path especially
 * as tools like vscode-test fails to perform the filtering itself.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

interface Options {
  baseDir: string;
  excludes: string[];
  help: boolean;
  inputs: string[];
  output: string;
  version: boolean;
}

function usage(): string {
  return [
    "Converts lcov output to cobertura-compatible XML",
    "",
    "Usage:",
    "  node tools/mk-cobertura.mts lcov-file.dat [lcov-file2.dat ...] [-b source/dir] [-e <exclude path regex>] [-o output.xml] [-d]",
    "",
    "Options:",
    "  -b, --base-dir   Directory where source files are located",
    "  -e, --excludes   Regex of source paths to exclude; can be repeated",
    "  -o, --output     Path to store cobertura xml file",
    "  -v, --version    Display version info",
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    baseDir: ".",
    excludes: [],
    help: false,
    inputs: [],
    output: "coverage.xml",
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-b" || arg === "--base-dir") {
      const value = argv[++index];
      if (value === undefined) {
        throw new Error(`${arg} requires a value`);
      }
      options.baseDir = value;
    } else if (arg === "-e" || arg === "--excludes") {
      const value = argv[++index];
      if (value === undefined) {
        throw new Error(`${arg} requires a value`);
      }
      options.excludes.push(value);
    } else if (arg === "-o" || arg === "--output") {
      const value = argv[++index];
      if (value === undefined) {
        throw new Error(`${arg} requires a value`);
      }
      options.output = value;
    } else if (arg === "-v" || arg === "--version") {
      options.version = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.inputs.push(arg);
    }
  }

  return options;
}

function pathExcluded(sourcePath: string, excludes: string[]): boolean {
  return excludes.some((exclude) => new RegExp(exclude).test(sourcePath));
}

function filterLcovByPath(lcovData: string, excludes: string[]): string {
  if (excludes.length === 0) {
    return lcovData;
  }

  const kept: string[] = [];
  for (const record of lcovData.split(/end_of_record\n?/)) {
    const trimmed = record.trim();
    if (!trimmed) {
      continue;
    }

    const sourcePath = /^SF:(.+)$/m.exec(trimmed)?.[1]?.trim();
    if (sourcePath !== undefined && pathExcluded(sourcePath, excludes)) {
      continue;
    }

    kept.push(trimmed);
  }

  return kept.map((record) => `${record}\nend_of_record`).join("\n");
}

function readLcovFiles(inputs: string[]): string {
  return inputs
    .map((input) => readFileSync(input, "utf8").trimEnd())
    .filter((data) => data.length > 0)
    .join("\n");
}

function runUpstream(
  input: string,
  options: Pick<Options, "baseDir" | "output">,
): void {
  const args = [input, "-b", options.baseDir, "-o", options.output];
  execFileSync("lcov-to-cobertura", args, { stdio: "inherit" });
}

function main(argv = process.argv.slice(2)): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stderr.write(`${usage()}\n`);
    return 1;
  }

  if (options.version) {
    process.stdout.write("[lcov_cobertura path-excludes]\n");
    return 0;
  }

  if (options.help || options.inputs.length === 0) {
    process.stdout.write(`${usage()}\n`);
    return options.help ? 0 : 1;
  }

  const lcovData = readLcovFiles(options.inputs);
  const filtered = filterLcovByPath(lcovData, options.excludes);
  const tempDir = mkdtempSync(path.join(tmpdir(), "lcov-to-cobertura-"));
  const filteredInput = path.join(tempDir, "filtered.lcov");

  try {
    writeFileSync(filteredInput, filtered, "utf8");
    runUpstream(filteredInput, options);
    return 0;
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  process.exitCode = main();
}
