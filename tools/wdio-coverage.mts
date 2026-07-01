#!/usr/bin/env node
/**
 * Convert V8 coverage JSON emitted by the VS Code extension host during WDIO
 * runs into lcov output for consolidation with other test coverage reports.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Report } from "c8";

type C8ReportWithExclude = Report & {
  exclude: {
    exclude: string[];
    relativePath: boolean;
  };
};

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultTempDir = path.join(projectRoot, "out/tmp/.v8-coverage-wdio");
const defaultReportsDir = path.join(projectRoot, "out/coverage/wdio");

/**
 * Generate WDIO coverage reports from collected V8 coverage data.
 * @returns Whether a report was written.
 */
export async function writeWdioCoverageReport(options?: {
  tempDirectory?: string;
  reportsDirectory?: string;
}): Promise<boolean> {
  const tempDirectory = options?.tempDirectory ?? defaultTempDir;
  const reportsDirectory = options?.reportsDirectory ?? defaultReportsDir;

  if (!existsSync(tempDirectory) || readdirSync(tempDirectory).length === 0) {
    console.warn(
      `No WDIO V8 coverage data found in ${tempDirectory}; skipping report.`,
    );
    return false;
  }

  mkdirSync(reportsDirectory, { recursive: true });

  const report = new Report({
    exclude: [
      "**/node_modules/**",
      "**/.wdio-vscode/**",
      "**/.vscode-test/**",
      "**/test/**",
    ],
    excludeNodeModules: true,
    mergeAsync: true,
    reporter: ["text-summary", "lcovonly"],
    reportsDirectory,
    src: [
      path.join(projectRoot, "src"),
      path.join(projectRoot, "dist"),
      path.join(projectRoot, "packages/ansible-language-server/src"),
      path.join(projectRoot, "packages/ansible-mcp-server/src"),
      path.join(projectRoot, "webviews"),
    ],
    tempDirectory,
  } as ConstructorParameters<typeof Report>[0]);

  // Istanbul's exclude checks are case-sensitive on Windows; see vscode-test-cli.
  const c8Report = report as C8ReportWithExclude;
  c8Report.exclude.relativePath = false;
  c8Report.exclude.exclude.push("**/.wdio-vscode/**", "**/.vscode-test/**");

  await report.run();
  return true;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    await writeWdioCoverageReport();
  } catch (error: unknown) {
    console.error(error);
    process.exit(1);
  }
}
