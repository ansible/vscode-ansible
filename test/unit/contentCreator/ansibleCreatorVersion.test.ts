import { describe, expect, it } from "vitest";
import {
  checkAnsibleCreatorVersion,
  checkToolVersionWithError,
  isAnsibleCreatorVersionGte,
  pep440ToSemverComparable,
} from "@src/features/contentCreator/ansibleCreatorVersion";
import { ANSIBLE_CREATOR_VERSION_MIN } from "@src/definitions/constants";

describe("pep440ToSemverComparable", () => {
  it("maps final releases to normalized semver", () => {
    expect(pep440ToSemverComparable("26.2.0")).toBe("26.2.0");
    expect(pep440ToSemverComparable("26.2")).toBe("26.2.0");
  });

  it("maps prereleases below the final release", () => {
    expect(pep440ToSemverComparable("26.2.0.dev0")).toBe("26.2.0-dev.0");
    expect(pep440ToSemverComparable("26.2.0rc1")).toBe("26.2.0-rc.1");
  });

  it("rejects bare post labels without a revision number", () => {
    expect(pep440ToSemverComparable("26.2.0.post")).toBeNull();
  });
});

describe("checkAnsibleCreatorVersion", () => {
  it("accepts final releases at or above the minimum", () => {
    expect(
      checkAnsibleCreatorVersion("26.2.0", ANSIBLE_CREATOR_VERSION_MIN),
    ).toEqual({ isGte: true });
    expect(
      checkAnsibleCreatorVersion("26.3.0", ANSIBLE_CREATOR_VERSION_MIN),
    ).toEqual({ isGte: true });
  });

  it("rejects prereleases even when semver.coerce would accept them", () => {
    expect(
      checkAnsibleCreatorVersion("26.2.0.dev0", ANSIBLE_CREATOR_VERSION_MIN),
    ).toEqual({ isGte: false });
    expect(
      checkAnsibleCreatorVersion("26.2.0rc1", ANSIBLE_CREATOR_VERSION_MIN),
    ).toEqual({ isGte: false });
  });

  it("rejects unknown tails without coercing to the release", () => {
    expect(
      checkAnsibleCreatorVersion("26.2.0.pre1", ANSIBLE_CREATOR_VERSION_MIN)
        .isGte,
    ).toBe(false);
  });

  it("rejects versions below the minimum within the same major", () => {
    expect(
      isAnsibleCreatorVersionGte("26.1.0", ANSIBLE_CREATOR_VERSION_MIN),
    ).toBe(false);
  });
});

describe("checkToolVersionWithError", () => {
  it("coerces noisy tool version strings when allowed", () => {
    expect(checkToolVersionWithError("v25.4", "25.0.0")).toEqual({
      isGte: true,
    });
  });
});
