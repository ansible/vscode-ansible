import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { formatAnsibleMetaData } from "@src/features/utils/formatAnsibleMetaData";

// Mock vscode workspace configuration
vi.mock("vscode", async () => {
  const actual = await vi.importActual<typeof vscode>("vscode");
  return {
    ...actual,
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn(() => true), // ansible.validation.lint.enabled = true
      })),
    },
    MarkdownString: class MarkdownString {
      value: string;
      supportHtml: boolean;
      isTrusted: boolean;

      constructor(value: string) {
        this.value = value;
        this.supportHtml = false;
        this.isTrusted = false;
      }

      appendMarkdown(value: string) {
        this.value += value;
      }
    },
  };
});

describe("formatAnsibleMetaData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ansible-lint upgrade status", () => {
    it("should not display warning span when upgrade status is 'nil' string", () => {
      const metaData = {
        "ansible information": {
          "core version": "2.20.3",
          location: "/usr/bin/ansible",
        },
        "python information": {
          version: "3.13.11",
          location: "/usr/bin/python3",
        },
        "ansible-lint information": {
          version: "26.3.0",
          location: "/usr/bin/ansible-lint",
          "upgrade status": "nil",
        },
      };

      const result = formatAnsibleMetaData(metaData);

      // The markdown should not contain a warning span for "nil"
      expect(result.markdown.value).not.toContain("<span");
      expect(result.markdown.value).not.toContain("nil");
    });

    it("should not display warning span when upgrade status is null", () => {
      const metaData = {
        "ansible information": {
          "core version": "2.20.3",
        },
        "python information": {
          version: "3.13.11",
        },
        "ansible-lint information": {
          version: "26.3.0",
          "upgrade status": null,
        },
      };

      const result = formatAnsibleMetaData(metaData);

      // The markdown should not contain a warning span for null
      expect(result.markdown.value).not.toContain("<span");
    });

    it("should not display warning span when upgrade status is undefined", () => {
      const metaData = {
        "ansible information": {
          "core version": "2.20.3",
        },
        "python information": {
          version: "3.13.11",
        },
        "ansible-lint information": {
          version: "26.3.0",
          "upgrade status": undefined,
        },
      };

      const result = formatAnsibleMetaData(metaData);

      // The markdown should not contain a warning span for undefined
      expect(result.markdown.value).not.toContain("<span");
    });

    it("should display warning span with proper closing tag when upgrade available", () => {
      const upgradeMessage =
        "A new release of ansible-lint is available: 24.9.2 → 26.3.0";
      const metaData = {
        "ansible information": {
          "core version": "2.20.3",
        },
        "python information": {
          version: "3.13.11",
        },
        "ansible-lint information": {
          version: "24.9.2",
          "upgrade status": upgradeMessage,
        },
      };

      const result = formatAnsibleMetaData(metaData);

      // The markdown should contain the warning span with the upgrade message
      expect(result.markdown.value).toContain(
        `style="color:#FFEF4A;">${upgradeMessage}</span>`,
      );
      // Verify the span is properly closed
      expect(result.markdown.value).toContain("</span>");
      // Count opening and closing span tags to ensure they match
      const openSpans = (result.markdown.value.match(/<span/g) || []).length;
      const closeSpans = (result.markdown.value.match(/<\/span>/g) || [])
        .length;
      expect(openSpans).toBe(closeSpans);
    });

    it("should handle whitespace-only 'nil' values", () => {
      const metaData = {
        "ansible information": {
          "core version": "2.20.3",
        },
        "python information": {
          version: "3.13.11",
        },
        "ansible-lint information": {
          version: "26.3.0",
          "upgrade status": "  nil  ",
        },
      };

      const result = formatAnsibleMetaData(metaData);

      // Should not display warning for whitespace-padded "nil"
      expect(result.markdown.value).not.toContain("<span");
    });

    it("should handle case-insensitive 'nil' values", () => {
      const testCases = ["NIL", "Nil", "nIl"];

      testCases.forEach((nilValue) => {
        const metaData = {
          "ansible information": {
            "core version": "2.20.3",
          },
          "python information": {
            version: "3.13.11",
          },
          "ansible-lint information": {
            version: "26.3.0",
            "upgrade status": nilValue,
          },
        };

        const result = formatAnsibleMetaData(metaData);

        // Should not display warning for any case variation of "nil"
        expect(result.markdown.value).not.toContain("<span");
      });
    });
  });

  describe("ansible not found", () => {
    it("should display warning when ansible is missing", () => {
      const metaData = {
        "ansible information": {},
        "python information": {
          version: "3.13.11",
          location: "/usr/bin/python3",
        },
        "ansible-lint information": {},
      };

      const result = formatAnsibleMetaData(metaData);

      expect(result.ansiblePresent).toBe(false);
      expect(result.markdown.value).toContain(
        "$(close) Ansible not found in the environment",
      );
      expect(result.markdown.value).toContain("Python version used:");
    });
  });

  describe("execution environment", () => {
    it("should indicate when execution environment is enabled", () => {
      const metaData = {
        "ansible information": {
          "core version": "2.20.4",
        },
        "python information": {
          version: "3.13.11",
        },
        "ansible-lint information": {
          version: "26.4.0",
        },
        "execution environment information": {
          "container engine": "podman",
          "container image": "ghcr.io/ansible/community-ansible-dev-tools",
        },
      };

      const result = formatAnsibleMetaData(metaData);

      expect(result.eeEnabled).toBe(true);
      expect(result.markdown.value).toContain(
        "Ansible meta data (in Execution Environment)",
      );
    });
  });

  describe("ansible-lint missing", () => {
    it("should show warning when ansible-lint is missing", () => {
      const metaData = {
        "ansible information": {
          "core version": "2.20.3",
        },
        "python information": {
          version: "3.13.11",
        },
        "ansible-lint information": {},
      };

      const result = formatAnsibleMetaData(metaData);

      expect(result.ansibleLintPresent).toBe(false);
      expect(result.markdown.value).toContain("$(warning) Warning(s):");
      expect(result.markdown.value).toContain(
        "Ansible lint is missing in the environment",
      );
    });
  });
});
