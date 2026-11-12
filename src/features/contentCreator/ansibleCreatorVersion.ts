import * as semver from "semver";

/** Map PEP 440 ansible-creator versions to semver for ordered comparison. */
export function pep440ToSemverComparable(version: string): string | null {
  let v = version.trim();
  if (/^v/i.test(v)) {
    v = v.slice(1);
  }
  v = v.replace(/^\d+!/, "");
  v = v.split("+")[0];

  if (/^\d+(?:\.\d+)*$/.test(v)) {
    const parts = v.split(".").map((segment) => parseInt(segment, 10));
    while (parts.length < 3) {
      parts.push(0);
    }
    return parts.join(".");
  }

  const match = v.match(/^(\d+(?:\.\d+)*)(.+)$/);
  if (!match) {
    return null;
  }

  const releaseParts = match[1]
    .split(".")
    .map((segment) => parseInt(segment, 10));
  while (releaseParts.length < 3) {
    releaseParts.push(0);
  }
  const releaseSemver = releaseParts.join(".");

  const pre = match[2].startsWith(".") ? match[2].slice(1) : match[2];
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
