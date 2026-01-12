import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createZenOfAnsibleHandler,
  createADEEnvironmentInfoHandler,
  createADESetupEnvironmentHandler,
  createADTCheckEnvHandler,
  createAgentsGuidelinesHandler,
} from "../src/handlers.js";
import { ZEN_OF_ANSIBLE } from "../src/constants.js";

// Mock the adeTools module
vi.mock("../src/tools/adeTools.js", () => ({
  getEnvironmentInfo: vi.fn(),
  formatEnvironmentInfo: vi.fn(),
  setupDevelopmentEnvironment: vi.fn(),
  checkAndInstallADT: vi.fn(),
}));

// Mock the agents resource module
vi.mock("../src/resources/agents.js", () => ({
  getAgentsGuidelines: vi.fn(),
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
      const { getEnvironmentInfo, formatEnvironmentInfo } =
        await import("../src/tools/adeTools.js");

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
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

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
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: false,
        output: "Setup failed",
        error: "Error message",
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      // Output includes info note about collections when none specified
      expect(result.content[0].text).toContain("Setup failed");
      expect(result.isError).toBe(true);
    });

    it("should handle exceptions during setup", async () => {
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

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

    it("should auto-detect collections from requirementsFile parameter", async () => {
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: true,
        output: "Environment setup completed",
        error: undefined,
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({
        requirementsFile: "amazon.aws ansible.posix",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("Auto-detected collections");
      expect(result.content[0].text).toContain("amazon.aws");
      expect(result.isError).toBe(false);

      // Verify setupDevelopmentEnvironment was called with collections moved
      expect(setupDevelopmentEnvironment).toHaveBeenCalledWith(
        "/test/workspace",
        expect.objectContaining({
          collections: ["amazon.aws", "ansible.posix"],
        }),
      );
    });

    it("should not auto-detect when requirementsFile has file extension", async () => {
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: true,
        output: "Environment setup completed",
        error: undefined,
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({
        requirementsFile: "requirements.txt",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).not.toContain("Auto-detected collections");
      expect(result.isError).toBe(false);

      // Verify requirementsFile was passed through unchanged
      expect(setupDevelopmentEnvironment).toHaveBeenCalledWith(
        "/test/workspace",
        expect.objectContaining({
          requirementsFile: "requirements.txt",
        }),
      );
    });

    it("should handle empty requirementsFile", async () => {
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: true,
        output: "Environment setup completed",
        error: undefined,
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({
        requirementsFile: "",
      });

      expect(result.content).toHaveLength(1);
      expect(result.isError).toBe(false);

      // Verify empty requirementsFile was removed
      expect(setupDevelopmentEnvironment).toHaveBeenCalledWith(
        "/test/workspace",
        expect.not.objectContaining({
          requirementsFile: "",
        }),
      );
    });

    it("should merge auto-detected collections with existing collections", async () => {
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

      vi.mocked(setupDevelopmentEnvironment).mockResolvedValue({
        success: true,
        output: "Environment setup completed",
        error: undefined,
      });

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({
        collections: ["community.general"],
        requirementsFile: "amazon.aws",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("Auto-detected collections");
      expect(result.isError).toBe(false);

      // Verify both existing and auto-detected collections are included
      expect(setupDevelopmentEnvironment).toHaveBeenCalledWith(
        "/test/workspace",
        expect.objectContaining({
          collections: ["community.general", "amazon.aws"],
        }),
      );
    });

    it("should handle non-Error exceptions during setup", async () => {
      const { setupDevelopmentEnvironment } =
        await import("../src/tools/adeTools.js");

      vi.mocked(setupDevelopmentEnvironment).mockRejectedValue("String error");

      const handler = createADESetupEnvironmentHandler("/test/workspace");
      const result = await handler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain(
        "Error setting up development environment: String error",
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
      const workspaceRoot = "/path/to/workspace";

      vi.mocked(checkAndInstallADT).mockResolvedValue({
        success: true,
        output: "ADT is installed",
        error: undefined,
      });

      const handler = createADTCheckEnvHandler(workspaceRoot);
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("ADT is installed");
      expect(result.isError).toBe(false);
      expect(checkAndInstallADT).toHaveBeenCalledWith(workspaceRoot);
    });

    it("should handle ADT check failures", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");
      const workspaceRoot = "/path/to/workspace";

      vi.mocked(checkAndInstallADT).mockResolvedValue({
        success: false,
        output: "Failed to install ADT",
        error: "Installation failed",
      });

      const handler = createADTCheckEnvHandler(workspaceRoot);
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("Failed to install ADT");
      expect(result.isError).toBe(true);
      expect(checkAndInstallADT).toHaveBeenCalledWith(workspaceRoot);
    });

    it("should handle exceptions during ADT check", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");
      const workspaceRoot = "/path/to/workspace";

      vi.mocked(checkAndInstallADT).mockRejectedValue(
        new Error("Check exception"),
      );

      const handler = createADTCheckEnvHandler(workspaceRoot);
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error checking/installing ADT: Check exception",
      );
      expect(result.isError).toBe(true);
      expect(checkAndInstallADT).toHaveBeenCalledWith(workspaceRoot);
    });

    it("should handle non-Error exceptions during ADT check", async () => {
      const { checkAndInstallADT } = await import("../src/tools/adeTools.js");
      const workspaceRoot = "/path/to/workspace";

      vi.mocked(checkAndInstallADT).mockRejectedValue("String exception");

      const handler = createADTCheckEnvHandler(workspaceRoot);
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Error checking/installing ADT: String exception",
      );
      expect(result.isError).toBe(true);
      expect(checkAndInstallADT).toHaveBeenCalledWith(workspaceRoot);
    });
  });

  describe("ansible_content_best_practices handler", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return available topics when called without arguments", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      const mockTopics =
        "# Available Topics\n\n- Guiding Principles\n- Coding Standards";
      vi.mocked(getAgentsGuidelines).mockResolvedValue(mockTopics);

      const handler = createAgentsGuidelinesHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(mockTopics);
      expect(result.isError).toBeUndefined();
      expect(getAgentsGuidelines).toHaveBeenCalledWith(undefined);
    });

    it("should return relevant sections when called with a topic", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      const mockContent =
        "## YAML Formatting\n\n- Indent at two spaces\n- Use .yml extension";
      vi.mocked(getAgentsGuidelines).mockResolvedValue(mockContent);

      const handler = createAgentsGuidelinesHandler();
      const result = await handler({ topic: "yaml formatting" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(mockContent);
      expect(result.isError).toBeUndefined();
      expect(getAgentsGuidelines).toHaveBeenCalledWith("yaml formatting");
    });

    it("should handle file reading errors gracefully", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      vi.mocked(getAgentsGuidelines).mockRejectedValue(
        new Error("File not found"),
      );

      const handler = createAgentsGuidelinesHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(
        "Error loading Ansible Content Best Practices: File not found",
      );
      expect(result.isError).toBe(true);
    });

    it("should handle non-Error exceptions", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      vi.mocked(getAgentsGuidelines).mockRejectedValue("String error");

      const handler = createAgentsGuidelinesHandler();
      const result = await handler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe(
        "Error loading Ansible Content Best Practices: String error",
      );
      expect(result.isError).toBe(true);
    });

    it("should return consistent results on multiple calls", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      const mockGuidelines = "# Test Guidelines\n\nContent here.";
      vi.mocked(getAgentsGuidelines).mockResolvedValue(mockGuidelines);

      const handler = createAgentsGuidelinesHandler();
      const result1 = await handler();
      const result2 = await handler();

      expect(result1.content[0].text).toBe(result2.content[0].text);
      expect(getAgentsGuidelines).toHaveBeenCalledTimes(2);
    });

    it("should pass topic to getAgentsGuidelines", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      vi.mocked(getAgentsGuidelines).mockResolvedValue("Roles content");

      const handler = createAgentsGuidelinesHandler();
      await handler({ topic: "roles" });

      expect(getAgentsGuidelines).toHaveBeenCalledWith("roles");
    });

    it("should handle empty topic as undefined", async () => {
      const { getAgentsGuidelines } =
        await import("../src/resources/agents.js");

      vi.mocked(getAgentsGuidelines).mockResolvedValue("Available topics");

      const handler = createAgentsGuidelinesHandler();
      await handler({ topic: "" });

      expect(getAgentsGuidelines).toHaveBeenCalledWith("");
    });
  });
});
