#!/usr/bin/env node
// We must keep the .mts extension as otherwise node will fail to execute the file.
/**
 * Prints the marketplace-style version string using the same rules as
 * `tools/helper --version` (git describe + optional prerelease patch from
 * commit timestamps).
 */
import { execSync } from "node:child_process";

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
    return `v${String(yy).padStart(2, "0")}.${month}.1-1-no_tags`;
  }
}

function main(): void {
  // We ignore failure to get tags because when we run inside a container inside
  // preflight the remote is not available.
  execSync("git ls-remote && git fetch --tags || true", {
    shell: "/bin/sh",
    stdio: ["ignore", "ignore", "ignore"],
  });

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
          shell: "/bin/sh",
        }).trimEnd(),
        10,
      );
      lastCommitTimestamp = Number.parseInt(
        execSync("git -P show --no-patch --format=%ct HEAD", {
          encoding: "utf8",
          shell: "/bin/sh",
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
  // Match helper logging shape for anyone diffing behavior (stderr only).
  console.error(
    `Determined version=${out} and pre_release=${preRelease ? "True" : "False"} base on git describe result: ${gitTag}`,
  );
  console.log(out);
}

main();
