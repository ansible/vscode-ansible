import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createZenOfAnsibleHandler,
  createADEEnvironmentInfoHandler,
  createADESetupEnvironmentHandler,
  createADTCheckEnvHandler,
} from "../src/handlers.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

// Mock the adeTools module
vi.mock("../src/tools/adeTools.js", () => ({
  getEnvironmentInfo: vi.fn(),
  formatEnvironmentInfo: vi.fn(),
  setupDevelopmentEnvironment: vi.fn(),
  checkAndInstallADT: vi.fn(),
}));

describe("MCP Handlers", () => {
  describe("zen_of_ansible handler", () => {
    it("should return the Zen of Ansible aphorisms", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: ZEN_OF_ANSIBLE,
          },
        ],
      });
    });

    it("should handle empty arguments", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Simple is better than complex");
    });

    it("should handle undefined arguments", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    });

    it("should return consistent results", async () => {
      const handler = createZenOfAnsibleHandler();
      const result1 = await handler();
      const result2 = await handler();

      expect(result1).toEqual(result2);
    });

    it("should return all 20 aphorisms", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      const text = result.content[0].text;
      const lines = text.split("\n").filter((line) => line.trim().length > 0);

      // Should have 20 numbered aphorisms
      const numberedLines = lines.filter((line) => /^\d+\./m.test(line.trim()));
      expect(numberedLines).toHaveLength(20);
    });

    it("should include key Ansible principles", async () => {
      const handler = createZenOfAnsibleHandler();
      const result = await handler();

      const text = result.content[0].text;

      // Check for key principles
      expect(text).toContain("Simple is better than complex");
      expect(text).toContain("Readability counts");
      expect(text).toContain("Declarative is better than imperative");
      expect(text).toContain("YAML");
    });
  });

  describe("ADE Environment Info Handler", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return formatted environment information successfully", async () => {
      const { getEnvironmentInfo, formatEnvironmentInfo } = await import(
        "../src/tools/adeTools.js"
      );

      vi.mocked(getEnvironmentInfo).mockResolvedValue({
        virtualEnv: "venv",
        pythonVersion: "Python 3.11.0",
        ansibleVersion: "ansible [core 2.15.0]",
        ansibleLintVersion: "ansible-lint 6.22.0",
        installedCollections: ["ansible.posix"],
        workspacePath: "/test/workspace",
        adeInstalled: true,
        adtInstalled: true,
      });

      vi.mocked(formatEnvironmentInfo).mockReturnValue(
        "🔍 Environment Information\nPython: Python 3.11.0",
      );

      const handler = createADEEnvironmentInfoHandler("/test/workspace");
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("🔍 Environment Information");
      expect(result.isError).toBeUndefined();
    });

    it("should handle errors gracefully", async () => {
      const { getEnvironmentInfo } = await import("../src/tools/adeTools.js");

      vi.mocked(getEnvironmentInfo).mockRejectedValue(new Error("Test error"));

      const handler = createADEEnvironmentInfoHandler("/test/workspace");
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error getting environment information: Test error",
      );
      expect(result.isError).toBe(true);
    });

    it("should handle non-Error exceptions", async () => {
      const { getEnvironmentInfo } = await import("../src/tools/adeTools.js");

      vi.mocked(getEnvironmentInfo).mockRejectedValue("String error");

      const handler = createADEEnvironmentInfoHandler("/test/workspace");
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error getting environment information: String error",
      );
      expect(result.isError).toBe(true);
    });
  });

  describe("ADE Setup Environment Handler", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should setup environment successfully", async () => {
      const { setupDevelopmentEnvironment } = await import(
        "../src/tools/adeTools.js"
      );

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: true,
        output: "Environment setup completed successfully",
        error: undefined,
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({
        envName: "test-env",
        pythonVersion: "3.11",
        collections: ["ansible.posix"],
        installRequirements: true,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Environment setup completed successfully",
      );
      expect(result.isError).toBe(false);
    });

    it("should handle setup failures", async () => {
      const { setupDevelopmentEnvironment } = await import(
        "../src/tools/adeTools.js"
      );

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: false,
        output: "Setup failed",
        error: "Error message",
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Setup failed");
      expect(result.isError).toBe(true);
    });

    it("should handle exceptions during setup", async () => {
      const { setupDevelopmentEnvironment } = await import(
        "../src/tools/adeTools.js"
      );

      vi.mocked(setupDevelopmentEnvironment).mockRejectedValue(
        new Error("Setup exception"),
      );

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error setting up development environment: Setup exception",
      );
      expect(result.isError).toBe(true);
    });
  });

  describe("ADT Check Env Handler", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should check and install ADT successfully", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");

      vi.mocked(checkAndInstallADT).mockResolvedValue({
        success: true,
        output: "ADT is installed",
        error: undefined,
      });

      const handler = createADTCheckEnvHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("ADT is installed");
      expect(result.isError).toBe(false);
    });

    it("should handle ADT check failures", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");

      vi.mocked(checkAndInstallADT).mockResolvedValue({
        success: false,
        output: "Failed to install ADT",
        error: "Installation failed",
      });

      const handler = createADTCheckEnvHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Failed to install ADT");
      expect(result.isError).toBe(true);
    });

    it("should handle exceptions during ADT check", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");

      vi.mocked(checkAndInstallADT).mockRejectedValue(
        new Error("Check exception"),
      );

      const handler = createADTCheckEnvHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error checking/installing ADT: Check exception",
      );
      expect(result.isError).toBe(true);
    });

    it("should handle non-Error exceptions during ADT check", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");

      vi.mocked(checkAndInstallADT).mockRejectedValue("String exception");

      const handler = createADTCheckEnvHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error checking/installing ADT: String exception",
      );
      expect(result.isError).toBe(true);
    });
  });

  // describe("ansible_lint handler", () => {
  //   it("should handle file input without options", async () => {
  //     const handler = createAnsibleLintHandler();
  //     const result = await handler({ file: "playbook.yml" });

  //     // This will fail in test environment since ansible-lint isn't available
  //     // but we can test the structure
  //     expect(result.content).toBeDefined();
  //     expect(result.content.length).toBeGreaterThan(0);
  //   });

  //   it("should handle file input with options", async () => {
  //     const handler = createAnsibleLintHandler();
  //     const result = await handler({
  //       file: "playbook.yml",
  //       extraArgs: ["--skip-list", "no-changed-when"],
  //     });

  //     expect(result.content).toBeDefined();
  //     expect(result.content.length).toBeGreaterThan(0);
  //   });

  //   it("should handle file input with multiple options", async () => {
  //     const handler = createAnsibleLintHandler();
  //     const result = await handler({
  //       file: "playbook.yml",
  //       extraArgs: [
  //         "--skip-list",
  //         "no-changed-when",
  //         "--exclude",
  //         "roles/legacy/",
  //       ],
  //     });

  //     expect(result.content).toBeDefined();
  //     expect(result.content.length).toBeGreaterThan(0);
  //   });
  // });
});
