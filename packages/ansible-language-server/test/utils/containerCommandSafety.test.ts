import { describe, expect, it } from "vitest";
import {
  UnsafeContainerSettingError,
  assertNoShellMetacharacters,
  formatVolumeMountSpec,
  parseContainerOptions,
  validateExecutionEnvironmentSettings,
} from "@src/utils/containerCommandSafety.js";

describe("containerCommandSafety", () => {
  describe("assertNoShellMetacharacters", () => {
    it("allows safe container flags", () => {
      expect(() =>
        assertNoShellMetacharacters("--net=host", "test"),
      ).not.toThrow();
    });

    it("rejects command injection via semicolon", () => {
      expect(() =>
        assertNoShellMetacharacters("; touch /tmp/pwned", "test"),
      ).toThrow(UnsafeContainerSettingError);
    });

    it("rejects command substitution", () => {
      expect(() => assertNoShellMetacharacters("$(id)", "test")).toThrow(
        UnsafeContainerSettingError,
      );
    });
  });

  describe("parseContainerOptions", () => {
    it("parses multiple flags", () => {
      expect(parseContainerOptions("--net=host --user=1000")).toEqual([
        "--net=host",
        "--user=1000",
      ]);
    });

    it("parses quoted values with spaces", () => {
      expect(parseContainerOptions('--label "foo bar"')).toEqual([
        "--label",
        "foo bar",
      ]);
    });

    it("rejects injection payloads", () => {
      expect(() => parseContainerOptions("--net=host; touch /tmp/cve")).toThrow(
        UnsafeContainerSettingError,
      );
    });

    it("rejects reported containerOptions injection pattern (CVE-2026-44191)", () => {
      const injectionPayload = "--net=host; touch /tmp/cve-2026-44191-pwned";
      expect(() => parseContainerOptions(injectionPayload)).toThrow(
        /disallowed shell metacharacters/,
      );
    });
  });

  describe("formatVolumeMountSpec", () => {
    it("formats a valid mount", () => {
      expect(
        formatVolumeMountSpec({
          src: "/host",
          dest: "/container",
          options: "Z",
        }),
      ).toBe("/host:/container:Z");
    });

    it("rejects injection in mount source", () => {
      expect(() =>
        formatVolumeMountSpec({
          src: "/tmp; touch /tmp/pwned",
          dest: "/container",
          options: undefined,
        }),
      ).toThrow(UnsafeContainerSettingError);
    });
  });

  describe("validateExecutionEnvironmentSettings", () => {
    it("validates all settings together", () => {
      expect(() =>
        validateExecutionEnvironmentSettings("", [
          { src: "/a", dest: "/b", options: undefined },
        ]),
      ).not.toThrow();
    });
  });
});
