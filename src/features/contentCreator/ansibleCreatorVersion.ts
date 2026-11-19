import * as semver from "semver";

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

/** Split a PEP 440 release from its suffix without a backtracking regex. */
function readRelease(
  version: string,
): { parts: number[]; rest: string } | null {
  const parts: number[] = [];
  let index = 0;
  while (index < version.length) {
    const start = index;
    while (isDigit(version[index])) {
      index += 1;
    }
    if (index === start) {
      break;
    }
    parts.push(Number.parseInt(version.slice(start, index), 10));
    if (version[index] === "." && isDigit(version[index + 1])) {
      index += 1;
      continue;
    }
    break;
  }
  if (parts.length === 0) {
    return null;
  }
  return { parts, rest: version.slice(index) };
}

function padRelease(parts: number[]): string {
  const padded = parts.slice();
  while (padded.length < 3) {
    padded.push(0);
  }
  return padded.join(".");
}

/** Map PEP 440 ansible-creator versions to semver for ordered comparison. */
export function pep440ToSemverComparable(version: string): string | null {
  let normalized = version.trim();
  if (/^v/i.test(normalized)) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.replace(/^\d+!/, "");
  const localSeparator = normalized.indexOf("+");
  if (localSeparator !== -1) {
    normalized = normalized.slice(0, localSeparator);
  }

  const parsed = readRelease(normalized);
  if (!parsed) {
    return null;
  }
  const releaseSemver = padRelease(parsed.parts);
  if (parsed.rest === "") {
    return releaseSemver;
  }

  const pre = parsed.rest.startsWith(".") ? parsed.rest.slice(1) : parsed.rest;
  if (!/^(?:dev|a|b|rc)\d+|post\d+$/i.test(pre)) {
    return null;
  }
  if (/^post\d+$/i.test(pre)) {
    return releaseSemver;
  }

  const preSemver = pre
    .replace(/^dev(\d+)$/i, "dev.$1")
    .replace(/^rc(\d+)$/i, "rc.$1")
    .replace(/^a(\d+)$/i, "alpha.$1")
    .replace(/^b(\d+)$/i, "beta.$1");
  return `${releaseSemver}-${preSemver}`;
}

function parseRequiredVersion(version: string): string | null {
  return (
    pep440ToSemverComparable(version) ??
    semver.valid(version) ??
    semver.coerce(version)?.version ??
    null
  );
}

/** Strict parse for ansible-creator output (no semver.coerce on current). */
function parseAnsibleCreatorCurrentVersion(version: string): string | null {
  const pep = pep440ToSemverComparable(version);
  if (pep) {
    return pep;
  }
  return semver.valid(version.trim()) ?? null;
}

export function checkAnsibleCreatorVersion(
  currentVersion: string,
  requiredVersion: string,
): { isGte: boolean; userMessage?: string } {
  try {
    const parsed = parseAnsibleCreatorCurrentVersion(currentVersion);
    const required = parseRequiredVersion(requiredVersion);
    if (!parsed || !required) {
      return {
        isGte: false,
        userMessage: `Invalid version format: ${currentVersion}.\n`,
      };
    }
    return { isGte: semver.gte(parsed, required) };
  } catch {
    return {
      isGte: false,
      userMessage: `Invalid version format: ${currentVersion}.\n`,
    };
  }
}

export function isAnsibleCreatorVersionGte(
  currentVersion: string,
  requiredVersion: string,
): boolean {
  return checkAnsibleCreatorVersion(currentVersion, requiredVersion).isGte;
}

/** Version check for CLI tools that may return noisy output (e.g. ade). */
export function checkToolVersionWithError(
  currentVersion: string,
  requiredVersion: string,
): { isGte: boolean; userMessage?: string } {
  try {
    const parsed =
      pep440ToSemverComparable(currentVersion) ??
      semver.valid(currentVersion) ??
      semver.coerce(currentVersion)?.version;
    const required = parseRequiredVersion(requiredVersion);
    if (!parsed || !required) {
      return {
        isGte: false,
        userMessage: `Invalid version format: ${currentVersion}.\n`,
      };
    }
    return { isGte: semver.gte(parsed, required) };
  } catch {
    return {
      isGte: false,
      userMessage: `Invalid version format: ${currentVersion}.\n`,
    };
  }
}
