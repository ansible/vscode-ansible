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

  it("pads short releases and maps dev, alpha, beta, rc, and post", () => {
    expect(pep440ToSemverComparable("26.2.dev0")).toBe("26.2.0-dev.0");
    expect(pep440ToSemverComparable("26.2.0a1")).toBe("26.2.0-alpha.1");
    expect(pep440ToSemverComparable("26.2.0b2")).toBe("26.2.0-beta.2");
    expect(pep440ToSemverComparable("26.2.0rc1")).toBe("26.2.0-rc.1");
    expect(pep440ToSemverComparable("26.2.0.post1")).toBe("26.2.0");
    expect(pep440ToSemverComparable("26.post2")).toBe("26.0.0");
  });

  it("strips a leading v, an epoch, and a local version", () => {
    expect(pep440ToSemverComparable("v26.2.0")).toBe("26.2.0");
    expect(pep440ToSemverComparable("1!26.2.0+g1")).toBe("26.2.0");
  });

  it("rejects strings that do not start with a release number", () => {
    expect(pep440ToSemverComparable("dev0")).toBeNull();
    expect(pep440ToSemverComparable("")).toBeNull();
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

  it("accepts a semver prerelease that is not PEP 440 syntax", () => {
    expect(checkAnsibleCreatorVersion("1.2.3-rc.1", "1.2.3")).toEqual({
      isGte: false,
    });
  });

  it("accepts a semver requirement that PEP 440 rejects", () => {
    expect(checkAnsibleCreatorVersion("1.2.3", "1.2.0-rc.1")).toEqual({
      isGte: true,
    });
  });

  it("rejects a requirement that no parser accepts", () => {
    expect(checkAnsibleCreatorVersion("1.0.0", "not-a-version")).toEqual({
      isGte: false,
      userMessage: "Invalid version format: 1.0.0.\n",
    });
  });
});

describe("checkToolVersionWithError", () => {
  it("coerces noisy tool version strings when allowed", () => {
    expect(checkToolVersionWithError("v25.4", "25.0.0")).toEqual({
      isGte: true,
    });
    expect(checkToolVersionWithError("1.2.3", "release-1.2.0")).toEqual({
      isGte: true,
    });
  });
});
