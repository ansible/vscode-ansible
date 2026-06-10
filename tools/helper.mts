#!/usr/bin/env node
// cspell:ignore rimraf ovsx
/**
 * Build helper: marketplace version from git, package VSIX, or publish to marketplaces.
 *
 *   node tools/helper.mts --version   # stdout only (Task VERSION)
 *   node tools/helper.mts --package
 *   node tools/helper.mts --publish
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

const VSIX_SIZE_LIMIT_MB = 10.0;

/** Same as Python `s.split(sep, maxsplit)` (maxsplit = max number of splits). */
function pySplit(s: string, sep: string, maxsplit: number): string[] {
  if (maxsplit <= 0) {
    return [s];
  }
  const i = s.indexOf(sep);
  if (i === -1) {
    return [s];
  }
  const head = s.slice(0, i);
  const tail = s.slice(i + sep.length);
  const rest = pySplit(tail, sep, maxsplit - 1);
  return [head, ...rest];
}

function getTags(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", shell: "/bin/sh" }).trimEnd();
  } catch {
    const now = new Date();
    const yy = now.getFullYear() % 100;
    const month = now.getMonth() + 1;
    console.warn(
      "This repository is missing tags. Fetch tags from upstream repository.",
    );
    return `v${String(yy).padStart(2, "0")}.${month}.1-1-no_tags`;
  }
}

/** Best-effort tag sync when a git remote exists (no-op in shallow/offline contexts). */
function fetchTagsIfPossible(): void {
  try {
    execSync("git ls-remote", {
      stdio: ["ignore", "ignore", "ignore"],
    });
    execSync("git fetch --tags", {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    console.warn("ignored git remote command");
  }
}

interface ResolvedVersion {
  version: string;
  preRelease: boolean;
  gitTag: string;
}

function resolveVersion(): ResolvedVersion {
  fetchTagsIfPossible();

  let preRelease = false;
  let result = getTags('git describe --dirty --tags --long --match "v*.*"');
  let gitTag = result;
  const firstParts = pySplit(gitTag, "-", 2);
  let tag = firstParts[0] ?? "";
  const commitsSince = firstParts[1] ?? "";
  const suffix = firstParts[2] ?? "";
  let version = tag.slice(1);
  let versionInfo = version.split(".").map((x) => Number.parseInt(x, 10));

  if (suffix.includes("-dirty") || commitsSince !== "0") {
    preRelease = true;
    result = getTags('git describe --dirty --tags --long --match "v*.*.0"');
    gitTag = result;
    tag = pySplit(gitTag, "-", 2)[0] ?? "";
    version = tag.slice(1);
    versionInfo = version.split(".").map((x) => Number.parseInt(x, 10));

    if (versionInfo.length === 2) {
      versionInfo.push(0);
    }
    if (versionInfo.length !== 3) {
      console.error(
        `Unsupported version tag (${version}) found, we only support MINOR.MAJOR.PATCH pattern.`,
      );
      process.exit(2);
    }

    let lastTagTimestamp: number;
    let lastCommitTimestamp: number;
    try {
      lastTagTimestamp = Number.parseInt(
        execSync(`git -P log -1 --format=%ct ${tag}`, {
          encoding: "utf8",
        }).trimEnd(),
        10,
      );
      lastCommitTimestamp = Number.parseInt(
        execSync("git -P show --no-patch --format=%ct HEAD", {
          encoding: "utf8",
        }).trimEnd(),
        10,
      );
    } catch {
      lastTagTimestamp = 1_721_335_286;
      lastCommitTimestamp = 1_722_605_520;
    }
    versionInfo[2] = lastCommitTimestamp - lastTagTimestamp;
  }

  const out = versionInfo.map(String).join(".");
  return { gitTag, preRelease, version: out };
}

function logVersionResolution(resolved: ResolvedVersion): void {
  console.error(
    `Determined version=${resolved.version} and pre_release=${resolved.preRelease ? "True" : "False"} base on git describe result: ${resolved.gitTag}`,
  );
}

function usage(): void {
  console.error(
    `Usage: ${process.argv[1]} [--version] [--package] [--publish]`,
  );
  process.exit(2);
}

function run(parts: string[]): void {
  const cmd = parts.filter((p) => p.length > 0).join(" ");
  console.error(`run: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function findPackagedVsix(): string[] {
  let names: string[];
  try {
    names = readdirSync("out");
  } catch {
    return [];
  }
  return names
    .filter((name) => /^ansible-[0-9].*\.vsix$/.test(name))
    .map((name) => join("out", name));
}

function main(): void {
  const args = process.argv.slice(2);
  const wantVersion = args.includes("--version");
  const wantPackage = args.includes("--package");
  const wantPublish = args.includes("--publish");

  if (
    args.some(
      (a) =>
        a.startsWith("-") &&
        !["--version", "--package", "--publish"].includes(a),
    )
  ) {
    usage();
  }
  if (!wantVersion && !wantPackage && !wantPublish) {
    usage();
  }

  const resolved = resolveVersion();

  if (wantVersion) {
    if (process.env.DEBUG === "1") {
      logVersionResolution(resolved);
    }
    console.log(resolved.version);
    return;
  }

  const preReleaseArg = resolved.preRelease ? "--pre-release" : "";

  if (wantPublish) {
    const vsixFiles = findPackagedVsix();
    const [vsix] = vsixFiles;
    if (vsixFiles.length !== 1 || vsix === undefined) {
      console.error(
        `Publish command requires presence of exactly one '.vsix' on disk, found: ${vsixFiles}`,
      );
      process.exit(2);
    }
    run([
      "npm",
      "exec",
      "--",
      "vsce",
      "publish",
      preReleaseArg,
      "--skip-duplicate",
      "--packagePath",
      vsix,
      "--readme-path",
      "docs/README.md",
    ]);
    run([
      "npm",
      "exec",
      "--",
      "ovsx",
      "publish",
      preReleaseArg,
      "--skip-duplicate",
      vsix,
    ]);
    return;
  }

  if (wantPackage) {
    run(["npm", "exec", "--", "rimraf", "-g", "./out/*.vsix"]);
    // --no-dependencies needed due to https://github.com/microsoft/vscode-vsce/issues/439
    // most options are supposed to be loaded from package.json but --no-update-package-json apparently is still needed
    const vsixFile = `out/ansible-${resolved.version}.vsix`;
    run([
      "npm",
      "exec",
      "--",
      "vsce",
      "package",
      "--no-update-package-json",
      `--out=${vsixFile}`,
      preReleaseArg,
      resolved.version,
    ]);
    const latestLink = join("out", "data", "ansible-latest.vsix");
    mkdirSync(join("out", "data"), { recursive: true });
    try {
      unlinkSync(latestLink);
    } catch {
      // missing_ok
    }
    try {
      linkSync(vsixFile, latestLink);
    } catch {
      copyFileSync(vsixFile, latestLink);
    }
    mkdirSync("out/log", { recursive: true });
    const sizeMb = statSync(vsixFile).size / 1024 / 1024;
    console.log(`Generated ${vsixFile} of size ${sizeMb.toFixed(2)} MB`);
    if (sizeMb > VSIX_SIZE_LIMIT_MB) {
      console.error(
        `The generated vsix file is ${sizeMb.toFixed(2)} MB, larger than ${VSIX_SIZE_LIMIT_MB} MB limit, this would required extensive review to see if we didn't accidentally include any essential files.`,
      );
      process.exit(2);
    }
  }
}

main();
