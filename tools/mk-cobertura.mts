#!/usr/bin/env node
/**
 * Converts multiple lcov.info files into a single cobertura-compatible XML file
 * while being able to remove some extra folders from the source path especially
 * as tools like vscode-test fails to perform the filtering itself.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function readLcovFiles(
  inputs: string[],
  unitIndex?: UnitCoverageIndex,
): string {
  return inputs
    .map((input) => {
      let data = readFileSync(input, "utf8").trimEnd();
      if (data.length === 0) {
        return "";
      }
      if (unitIndex !== undefined && isUnitLcov(input)) {
        data = expandCoveredStatementLines(data, unitIndex).trimEnd();
      }
      return data;
    })
    .filter((data) => data.length > 0)
    .join("\n");
}

interface UnitCoverageIndex {
  /** "line,block,branch" keys present in the unit report, per source file. */
  branches: Map<string, Set<string>>;
  /** DA line numbers present in the unit report, per source file. */
  lines: Map<string, Set<number>>;
}

function splitLcovRecords(lcovData: string): string[] {
  return lcovData
    .split(/end_of_record\n?/)
    .map((record) => record.trim())
    .filter((record) => record.length > 0);
}

function sourceFileOf(record: string): string | undefined {
  return /^SF:(.+)$/m.exec(record)?.[1]?.trim();
}

/**
 * Index lines and branches the unit report actually instrumented.
 * Vitest's V8 reporter only emits statement lines. c8's e2e/wdio
 * conversion emits DA:0 for every source line, including braces and
 * signatures V8 never tracks. Those zeros become uncovered lines in
 * Sonar and Codecov even when the statement was executed.
 */
export function indexUnitCoverage(unitLcov: string): UnitCoverageIndex {
  const lines = new Map<string, Set<number>>();
  const branches = new Map<string, Set<string>>();
  for (const record of splitLcovRecords(unitLcov)) {
    const sourceFile = sourceFileOf(record);
    if (sourceFile === undefined) {
      continue;
    }
    let fileLines = lines.get(sourceFile);
    if (fileLines === undefined) {
      fileLines = new Set<number>();
      lines.set(sourceFile, fileLines);
    }
    let fileBranches = branches.get(sourceFile);
    if (fileBranches === undefined) {
      fileBranches = new Set<string>();
      branches.set(sourceFile, fileBranches);
    }
    for (const rawLine of record.split("\n")) {
      if (rawLine.startsWith("DA:")) {
        const lineNo = Number.parseInt(
          rawLine.slice(3).split(",")[0] ?? "",
          10,
        );
        if (!Number.isNaN(lineNo)) {
          fileLines.add(lineNo);
        }
      } else if (rawLine.startsWith("BRDA:")) {
        const parts = rawLine.slice(5).split(",");
        if (parts.length >= 3) {
          fileBranches.add(`${parts[0]},${parts[1]},${parts[2]}`);
        }
      }
    }
  }
  return { branches, lines };
}

function isMiss(hits: string): boolean {
  const normalized = hits.trim();
  return normalized === "0" || normalized === "-";
}

/**
 * Drop zero-hit lines from a non-unit lcov report when the unit report
 * measured that file and did not instrument the line. Records for files
 * the unit report did not measure are left unchanged. Real unit misses
 * (DA present with 0 hits) are kept.
 */
export function filterLcovAgainstUnit(
  otherLcov: string,
  unitIndex: UnitCoverageIndex,
): string {
  const records: string[] = [];
  for (const record of splitLcovRecords(otherLcov)) {
    const sourceFile = sourceFileOf(record);
    const knownLines =
      sourceFile === undefined ? undefined : unitIndex.lines.get(sourceFile);
    if (sourceFile === undefined || knownLines === undefined) {
      records.push(`${record}\nend_of_record`);
      continue;
    }
    const kept: string[] = [];
    let lf = 0;
    let lh = 0;
    let brf = 0;
    let brh = 0;
    for (const rawLine of record.split("\n")) {
      if (rawLine.startsWith("DA:")) {
        const parts = rawLine.slice(3).split(",");
        const lineNo = Number.parseInt(parts[0] ?? "", 10);
        const hits = Number.parseInt(parts[1] ?? "", 10);
        const missed = Number.isNaN(hits) || hits === 0;
        if (missed && !knownLines.has(lineNo)) {
          continue;
        }
        kept.push(rawLine);
        lf += 1;
        if (!missed) {
          lh += 1;
        }
      } else if (rawLine.startsWith("BRDA:")) {
        const parts = rawLine.slice(5).split(",");
        const hits = parts[3] ?? "0";
        kept.push(rawLine);
        brf += 1;
        if (!isMiss(hits)) {
          brh += 1;
        }
      } else if (!/^(?:LF|LH|BRF|BRH):/.test(rawLine) && rawLine.length > 0) {
        kept.push(rawLine);
      }
    }
    kept.push(`BRF:${brf}`, `BRH:${brh}`, `LF:${lf}`, `LH:${lh}`);
    records.push(`${kept.join("\n")}\nend_of_record`);
  }
  return `${records.join("\n")}\n`;
}

function isUnitLcov(inputPath: string): boolean {
  return path.basename(path.dirname(inputPath)) === "unit";
}

/**
 * V8 records a hit on the first line of a statement and omits the rest.
 * Sonar counts those omitted lines as uncovered. Copy a positive hit across
 * a short gap when the next instrumented line is covered too, so continuation
 * lines and signatures follow the statement that ran. Gaps beside an
 * uncovered line stay untouched.
 */
const STATEMENT_GAP_LIMIT = 40;
const LEADING_SIGNATURE_LIMIT = 8;

export function expandCoveredStatementLines(
  lcovData: string,
  unitIndex?: UnitCoverageIndex,
): string {
  const expanded = splitLcovRecords(lcovData).map((record) => {
    const sourceFile = sourceFileOf(record);
    const knownLines =
      sourceFile === undefined || unitIndex === undefined
        ? undefined
        : unitIndex.lines.get(sourceFile);
    return expandRecord(record, knownLines);
  });
  return expanded.length === 0 ? "" : `${expanded.join("\n")}\n`;
}

function maySynthesizeLine(
  lineNo: number,
  da: Map<number, number>,
  instrumented: Set<number>,
  knownLines: Set<number> | undefined,
): boolean {
  if (da.has(lineNo) || instrumented.has(lineNo)) {
    return false;
  }
  return knownLines?.has(lineNo) !== true;
}

function expandRecord(record: string, knownLines?: Set<number>): string {
  const da = new Map<number, number>();
  /** Lines present in the input report; synthetic fills never become anchors. */
  const instrumented = new Set<number>();
  const rest: string[] = [];
  for (const rawLine of record.split("\n")) {
    if (rawLine.startsWith("DA:")) {
      const parts = rawLine.slice(3).split(",");
      const lineNo = Number.parseInt(parts[0] ?? "", 10);
      const hits = Number.parseInt(parts[1] ?? "", 10);
      if (!Number.isNaN(lineNo) && !Number.isNaN(hits)) {
        instrumented.add(lineNo);
        da.set(lineNo, hits);
      }
    } else if (!rawLine.startsWith("LF:") && !rawLine.startsWith("LH:")) {
      rest.push(rawLine);
    }
  }

  const ordered = [...instrumented].sort((left, right) => left - right);
  const firstInstrumented = ordered[0];
  if (firstInstrumented !== undefined && (da.get(firstInstrumented) ?? 0) > 0) {
    const firstHits = da.get(firstInstrumented) ?? 0;
    const start = Math.max(1, firstInstrumented - LEADING_SIGNATURE_LIMIT);
    for (let lineNo = start; lineNo < firstInstrumented; lineNo += 1) {
      if (maySynthesizeLine(lineNo, da, instrumented, knownLines)) {
        da.set(lineNo, firstHits);
      }
    }
  }
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const gap = end - start - 1;
    const startHits = da.get(start) ?? 0;
    const endHits = da.get(end) ?? 0;
    if (
      gap <= 0 ||
      gap > STATEMENT_GAP_LIMIT ||
      startHits <= 0 ||
      endHits <= 0
    ) {
      continue;
    }
    for (let lineNo = start + 1; lineNo < end; lineNo += 1) {
      if (maySynthesizeLine(lineNo, da, instrumented, knownLines)) {
        da.set(lineNo, startHits);
      }
    }
  }

  let lf = 0;
  let lh = 0;
  const daLines: string[] = [];
  for (const lineNo of [...da.keys()].sort((left, right) => left - right)) {
    const hits = da.get(lineNo) ?? 0;
    daLines.push(`DA:${lineNo},${hits}`);
    lf += 1;
    if (hits > 0) {
      lh += 1;
    }
  }
  return [...rest, ...daLines, `LF:${lf}`, `LH:${lh}`, "end_of_record"].join(
    "\n",
  );
}

/**
 * Rewrite e2e/wdio lcov files so Sonar, which reads each lcov directly,
 * does not keep zero hits for lines the unit report never instrumented.
 */
export function rewriteNonUnitLcov(inputs: string[]): void {
  const unitInputs = inputs.filter(
    (input) => isUnitLcov(input) && existsSync(input),
  );
  if (unitInputs.length === 0) {
    return;
  }
  const unitTexts = unitInputs.map((input) => readFileSync(input, "utf8"));
  const unitIndex = indexUnitCoverage(unitTexts.join("\n"));
  for (const input of inputs) {
    if (isUnitLcov(input) || !existsSync(input)) {
      continue;
    }
    const filtered = filterLcovAgainstUnit(
      readFileSync(input, "utf8"),
      unitIndex,
    );
    writeFileSync(input, filtered, "utf8");
  }
}

/**
 * Persist statement-gap hits into unit lcov files.
 *
 * expandCoveredStatementLines feeds Cobertura only. Sonar reads each
 * lcov.info on disk and counts lines missing from those reports as
 * uncovered, including signatures and continuations V8 never emits.
 * Filter non-unit reports first so their zeros are already gone before
 * these synthetic hits exist.
 */
export function rewriteUnitLcov(inputs: string[]): void {
  const unitInputs = inputs.filter(
    (input) => isUnitLcov(input) && existsSync(input),
  );
  if (unitInputs.length === 0) {
    return;
  }
  const unitIndex = indexUnitCoverage(
    unitInputs.map((input) => readFileSync(input, "utf8")).join("\n"),
  );
  for (const input of unitInputs) {
    const expanded = expandCoveredStatementLines(
      readFileSync(input, "utf8"),
      unitIndex,
    );
    if (expanded.length === 0) {
      continue;
    }
    writeFileSync(input, expanded, "utf8");
  }
}

/**
 * Merge lcov records that share the same source file (SF line).
 *
 * When multiple lcov reports (unit, e2e, wdio) contain the same SF entry,
 * lcov-to-cobertura overwrites per-file data with the last occurrence
 * instead of merging.  This function combines records per source file:
 *   - DA lines: keep the max hit count for each line number.
 *   - BRDA lines: keep the max branch-hit count per (line,block,branch).
 *   - FN/FNDA lines: keep the max function-hit count per function name.
 *   - LF/LH/BRF/BRH/FNF/FNH: recomputed from the merged data.
 */
function mergeLcovRecords(lcovData: string): string {
  interface FileRecord {
    /** "line,block,branch" → max hits (string because "-" is valid) */
    branches: Map<string, string>;
    /** function name → max hit count */
    fnHits: Map<string, number>;
    /** function name → start line */
    fnLines: Map<string, string>;
    /** DA line → max hit count */
    lines: Map<number, number>;
  }

  // Preserve order of first appearance.
  const files = new Map<string, FileRecord>();

  for (const rawRecord of lcovData.split(/end_of_record\n?/)) {
    const trimmed = rawRecord.trim();
    if (!trimmed) {
      continue;
    }

    const sfMatch = /^SF:(.+)$/m.exec(trimmed);
    if (!sfMatch) {
      continue;
    }
    const sf = sfMatch[1].trim();

    let rec = files.get(sf);
    if (!rec) {
      rec = {
        branches: new Map(),
        fnHits: new Map(),
        fnLines: new Map(),
        lines: new Map(),
      };
      files.set(sf, rec);
    }

    for (const rawLine of trimmed.split("\n")) {
      const line = rawLine.trim();
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const tag = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);

      if (tag === "DA") {
        const parts = value.split(",");
        const num = Number.parseInt(parts[0] ?? "", 10);
        const hits = Number.parseInt(parts[1] ?? "", 10);
        if (!Number.isNaN(num) && !Number.isNaN(hits)) {
          rec.lines.set(num, Math.max(rec.lines.get(num) ?? 0, hits));
        }
      } else if (tag === "BRDA") {
        // BRDA:line,block,branch,hits
        const parts = value.split(",");
        if (parts.length >= 4) {
          const key = `${parts[0]},${parts[1]},${parts[2]}`;
          const hitsStr = parts[3] ?? "-";
          const prev = rec.branches.get(key);
          if (prev === undefined || prev === "-") {
            rec.branches.set(key, hitsStr);
          } else if (hitsStr !== "-") {
            const prevN = Number.parseInt(prev, 10);
            const curN = Number.parseInt(hitsStr, 10);
            if (!Number.isNaN(prevN) && !Number.isNaN(curN)) {
              rec.branches.set(key, String(Math.max(prevN, curN)));
            }
          }
        }
      } else if (tag === "FN") {
        const commaIdx = value.indexOf(",");
        if (commaIdx !== -1) {
          const fnLine = value.slice(0, commaIdx);
          const fnName = value.slice(commaIdx + 1);
          rec.fnLines.set(fnName, fnLine);
        }
      } else if (tag === "FNDA") {
        const commaIdx = value.indexOf(",");
        if (commaIdx !== -1) {
          const hits = Number.parseInt(value.slice(0, commaIdx), 10);
          const fnName = value.slice(commaIdx + 1);
          if (!Number.isNaN(hits)) {
            rec.fnHits.set(fnName, Math.max(rec.fnHits.get(fnName) ?? 0, hits));
          }
        }
      }
      // LF/LH/BRF/BRH/FNF/FNH are recomputed below.
    }
  }

  // Rebuild a single lcov string with one record per source file.
  const out: string[] = [];
  for (const [sf, rec] of files) {
    out.push(`SF:${sf}`);

    // FN lines
    for (const [fnName, fnLine] of rec.fnLines) {
      out.push(`FN:${fnLine},${fnName}`);
    }
    let fnf = 0;
    let fnh = 0;
    for (const [fnName, hits] of rec.fnHits) {
      out.push(`FNDA:${hits},${fnName}`);
      fnf += 1;
      if (hits > 0) fnh += 1;
    }
    out.push(`FNF:${fnf}`);
    out.push(`FNH:${fnh}`);

    // BRDA lines
    let brf = 0;
    let brh = 0;
    for (const [key, hits] of rec.branches) {
      out.push(`BRDA:${key},${hits}`);
      brf += 1;
      if (hits !== "-" && hits !== "0") brh += 1;
    }
    out.push(`BRF:${brf}`);
    out.push(`BRH:${brh}`);

    // DA lines (sorted by line number)
    const sortedLines = [...rec.lines.entries()].sort(([a], [b]) => a - b);
    let lf = 0;
    let lh = 0;
    for (const [num, hits] of sortedLines) {
      out.push(`DA:${num},${hits}`);
      lf += 1;
      if (hits > 0) lh += 1;
    }
    out.push(`LF:${lf}`);
    out.push(`LH:${lh}`);
    out.push("end_of_record");
  }

  return out.join("\n");
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

  rewriteNonUnitLcov(options.inputs);
  rewriteUnitLcov(options.inputs);
  const unitInputs = options.inputs.filter(
    (input) => isUnitLcov(input) && existsSync(input),
  );
  const unitIndex =
    unitInputs.length === 0
      ? undefined
      : indexUnitCoverage(
          unitInputs.map((input) => readFileSync(input, "utf8")).join("\n"),
        );
  const lcovData = readLcovFiles(options.inputs, unitIndex);
  const merged = mergeLcovRecords(lcovData);
  const filtered = filterLcovByPath(merged, options.excludes);
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
