/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { RoleFileType } from "../../../../src/interfaces/lightspeed";
import { ThumbsUpDownAction } from "../../../../src/definitions/lightspeed";

// Mock vscode commands first (before any imports that use it)
vi.mock("vscode", async () => {
  const actual = await vi.importActual("vscode");
  return {
    ...actual,
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

// Mock the extension module with factory function
vi.mock("../../../../src/extension", () => {
  return {
    lightSpeedManager: {
      settingsManager: {
        settings: {
          lightSpeedService: {
            provider: "wca",
          },
        },
      },
      providerManager: {
        chatRequest: vi.fn(),
        generatePlaybook: vi.fn(),
        generateRole: vi.fn(),
      },
      contentMatchesProvider: {
        suggestionDetails: [],
      },
    },
  };
});

// Import after mocks are set up
import {
  explainPlaybook,
  explainRole,
  generatePlaybook,
  generateRole,
  thumbsUpDown,
  contentMatch,
  updatePromptHistory,
} from "../../../../src/features/lightspeed/vue/views/lightspeedUtils";
import { lightSpeedManager } from "../../../../src/extension";
import { LightSpeedAPI } from "../../../../src/features/lightspeed/api";

describe("lightspeedUtils", () => {
  // Create mock API instance
  const mockApiInstance = {
    explanationRequest: vi.fn(),
    roleExplanationRequest: vi.fn(),
    roleGenerationRequest: vi.fn(),
    playbookGenerationRequest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to WCA provider by default
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
      "wca";
    lightSpeedManager.contentMatchesProvider.suggestionDetails = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("explainPlaybook", () => {
    const testContent = "---\n- name: Test playbook\n  hosts: all";
    const testExplanationId = "test-explanation-id";

    describe("with WCA provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "wca";
      });

      it("should call apiInstance.explanationRequest with correct params", async () => {
        const expectedResponse = {
          content: "This playbook does X",
          format: "markdown",
          explanationId: testExplanationId,
        };
        mockApiInstance.explanationRequest.mockResolvedValue(expectedResponse);

        const result = await explainPlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testContent,
          testExplanationId,
        );

        expect(mockApiInstance.explanationRequest).toHaveBeenCalledWith({
          content: testContent,
          explanationId: testExplanationId,
        });
        expect(result).toEqual(expectedResponse);
      });

      it("should return error from API", async () => {
        const errorResponse = {
          message: "API error",
          code: "API_ERROR",
        };
        mockApiInstance.explanationRequest.mockResolvedValue(errorResponse);

        const result = await explainPlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testContent,
          testExplanationId,
        );

        expect(result).toEqual(errorResponse);
      });
    });

    describe("with LLM provider (non-WCA)", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "ollama";
      });

      it("should use providerManager.chatRequest for explanation", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.chatRequest,
        ).mockResolvedValue({
          message: "LLM explanation of the playbook",
          conversationId: testExplanationId,
        });

        const result = await explainPlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testContent,
          testExplanationId,
        );

        expect(
          lightSpeedManager.providerManager.chatRequest,
        ).toHaveBeenCalledWith({
          message: expect.stringContaining(testContent),
          conversationId: testExplanationId,
          metadata: { isExplanation: true },
        });
        expect(result).toEqual({
          content: "LLM explanation of the playbook",
          format: "markdown",
          explanationId: testExplanationId,
        });
      });

      it("should return error when chatRequest throws", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.chatRequest,
        ).mockRejectedValue(new Error("LLM connection failed"));

        const result = await explainPlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testContent,
          testExplanationId,
        );

        expect(result).toEqual({
          message: "LLM connection failed",
          code: "EXPLANATION_ERROR",
        });
      });

      it("should handle non-Error exceptions", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.chatRequest,
        ).mockRejectedValue("string error");

        const result = await explainPlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testContent,
          testExplanationId,
        );

        expect(result).toEqual({
          message: "Playbook explanation failed",
          code: "EXPLANATION_ERROR",
        });
      });
    });
  });

  describe("explainRole", () => {
    const testFiles = [
      {
        path: "tasks/main.yml",
        content: "- debug: msg=hello",
        file_type: RoleFileType.Task,
      },
      {
        path: "defaults/main.yml",
        content: "my_var: value",
        file_type: RoleFileType.Default,
      },
    ];
    const testRoleName = "my_role";
    const testExplanationId = "test-role-explanation-id";

    describe("with WCA provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "wca";
      });

      it("should call apiInstance.roleExplanationRequest with correct params", async () => {
        const expectedResponse = {
          content: "This role configures X",
          format: "markdown",
          explanationId: testExplanationId,
        };
        mockApiInstance.roleExplanationRequest.mockResolvedValue(
          expectedResponse,
        );

        const result = await explainRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testFiles,
          testRoleName,
          testExplanationId,
        );

        expect(mockApiInstance.roleExplanationRequest).toHaveBeenCalledWith({
          files: testFiles,
          roleName: testRoleName,
          explanationId: testExplanationId,
        });
        expect(result).toEqual(expectedResponse);
      });
    });

    describe("with LLM provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "ollama";
      });

      it("should combine files and use chatRequest", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.chatRequest,
        ).mockResolvedValue({
          message: "LLM explanation of the role",
          conversationId: testExplanationId,
        });

        const result = await explainRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testFiles,
          testRoleName,
          testExplanationId,
        );

        // Should combine files with path headers
        expect(
          lightSpeedManager.providerManager.chatRequest,
        ).toHaveBeenCalledWith({
          message: expect.stringContaining("# tasks/main.yml"),
          conversationId: testExplanationId,
          metadata: {
            isExplanation: true,
            ansibleFileType: "tasks",
          },
        });
        expect(result).toEqual({
          content: "LLM explanation of the role",
          format: "markdown",
          explanationId: testExplanationId,
        });
      });

      it("should return error when chatRequest throws", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.chatRequest,
        ).mockRejectedValue(new Error("Role explanation failed"));

        const result = await explainRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testFiles,
          testRoleName,
          testExplanationId,
        );

        expect(result).toEqual({
          message: "Role explanation failed",
          code: "EXPLANATION_ERROR",
        });
      });
    });
  });

  describe("generatePlaybook", () => {
    const testText = "Create a playbook to install nginx";
    const testGenerationId = "test-generation-id";

    describe("with WCA provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "wca";
      });

      it("should call playbookGenerationRequest with createOutline=true when outline is empty", async () => {
        const expectedResponse = {
          playbook: "---\n- name: Install nginx",
          outline: "1. Install nginx",
          generationId: testGenerationId,
        };
        mockApiInstance.playbookGenerationRequest.mockResolvedValue(
          expectedResponse,
        );

        const result = await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          "", // empty outline
          testGenerationId,
        );

        expect(mockApiInstance.playbookGenerationRequest).toHaveBeenCalledWith({
          text: testText,
          outline: undefined,
          createOutline: true,
          generationId: testGenerationId,
        });
        expect(result).toEqual(expectedResponse);
      });

      it("should call playbookGenerationRequest with createOutline=false when outline provided", async () => {
        const existingOutline = "1. Step one\n2. Step two";
        const expectedResponse = {
          playbook: "---\n- name: Step one",
          outline: existingOutline,
          generationId: testGenerationId,
        };
        mockApiInstance.playbookGenerationRequest.mockResolvedValue(
          expectedResponse,
        );

        const result = await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          existingOutline,
          testGenerationId,
        );

        expect(mockApiInstance.playbookGenerationRequest).toHaveBeenCalledWith({
          text: testText,
          outline: existingOutline,
          createOutline: false,
          generationId: testGenerationId,
        });
        expect(result).toEqual(expectedResponse);
      });

      it("should return error from API", async () => {
        const errorResponse = {
          message: "Generation failed",
          code: "GENERATION_ERROR",
        };
        mockApiInstance.playbookGenerationRequest.mockResolvedValue(
          errorResponse,
        );

        const result = await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          "",
          testGenerationId,
        );

        expect(result).toEqual(errorResponse);
      });
    });

    describe("with LLM provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "ollama";
      });

      it("should use providerManager.generatePlaybook", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.generatePlaybook,
        ).mockResolvedValue({
          content: "---\n- name: LLM generated playbook",
          outline: "1. LLM outline",
        });

        const result = await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          "",
          testGenerationId,
        );

        expect(
          lightSpeedManager.providerManager.generatePlaybook,
        ).toHaveBeenCalledWith({
          prompt: testText,
          type: "playbook",
          createOutline: true,
          outline: undefined,
        });
        expect(result).toEqual({
          playbook: "---\n- name: LLM generated playbook",
          outline: "1. LLM outline",
          generationId: testGenerationId,
        });
      });

      it("should pass outline when provided", async () => {
        const existingOutline = "1. Custom outline";
        vi.mocked(
          lightSpeedManager.providerManager.generatePlaybook,
        ).mockResolvedValue({
          content: "---\n- name: Playbook with outline",
          outline: existingOutline,
        });

        await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          existingOutline,
          testGenerationId,
        );

        expect(
          lightSpeedManager.providerManager.generatePlaybook,
        ).toHaveBeenCalledWith({
          prompt: testText,
          type: "playbook",
          createOutline: false,
          outline: existingOutline,
        });
      });

      it("should return error when generatePlaybook throws", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.generatePlaybook,
        ).mockRejectedValue(new Error("LLM error"));

        const result = await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          "",
          testGenerationId,
        );

        expect(result).toEqual({
          message: "LLM error",
          code: "GENERATION_ERROR",
        });
      });

      it("should handle empty outline in LLM response", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.generatePlaybook,
        ).mockResolvedValue({
          content: "---\n- name: Playbook",
          outline: undefined, // no outline returned
        });

        const result = await generatePlaybook(
          mockApiInstance as unknown as LightSpeedAPI,
          testText,
          "",
          testGenerationId,
        );

        expect(result).toEqual({
          playbook: "---\n- name: Playbook",
          outline: "", // should default to empty string
          generationId: testGenerationId,
        });
      });
    });
  });

  describe("generateRole", () => {
    const testText = "Create a role to configure apache";
    const testName = "apache_role";
    const testGenerationId = "test-role-gen-id";

    describe("with WCA provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "wca";
      });

      it("should call roleGenerationRequest with correct params", async () => {
        const expectedResponse = {
          files: [
            {
              path: "tasks/main.yml",
              content: "---\n- name: Install apache",
              file_type: RoleFileType.Task,
            },
          ],
          name: testName,
          outline: "1. Install apache",
          generationId: testGenerationId,
        };
        mockApiInstance.roleGenerationRequest.mockResolvedValue(
          expectedResponse,
        );

        const result = await generateRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testName,
          testText,
          "",
          testGenerationId,
        );

        expect(mockApiInstance.roleGenerationRequest).toHaveBeenCalledWith({
          text: testText,
          outline: undefined,
          createOutline: true,
          generationId: testGenerationId,
          name: testName,
        });
        expect(result).toEqual(expectedResponse);
      });

      it("should pass outline when provided", async () => {
        const existingOutline = "1. Step one";
        mockApiInstance.roleGenerationRequest.mockResolvedValue({
          files: [],
          name: testName,
          generationId: testGenerationId,
        });

        await generateRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testName,
          testText,
          existingOutline,
          testGenerationId,
        );

        expect(mockApiInstance.roleGenerationRequest).toHaveBeenCalledWith({
          text: testText,
          outline: existingOutline,
          createOutline: false,
          generationId: testGenerationId,
          name: testName,
        });
      });
    });

    describe("with LLM provider", () => {
      beforeEach(() => {
        lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
          "ollama";
      });

      it("should use providerManager.generateRole and structure files", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.generateRole,
        ).mockResolvedValue({
          content: "---\n- name: LLM task",
          outline: "1. LLM outline",
        });

        const result = await generateRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testName,
          testText,
          "",
          testGenerationId,
        );

        expect(
          lightSpeedManager.providerManager.generateRole,
        ).toHaveBeenCalledWith({
          prompt: testText,
          type: "role",
          createOutline: true,
          outline: undefined,
        });

        // Should structure response with files array
        expect(result).toEqual({
          role: "---\n- name: LLM task",
          files: [
            {
              path: "tasks/main.yml",
              content: "---\n- name: LLM task",
              file_type: RoleFileType.Task,
            },
          ],
          name: testName,
          outline: "1. LLM outline",
          generationId: testGenerationId,
        });
      });

      it("should use default name when name is undefined", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.generateRole,
        ).mockResolvedValue({
          content: "---\n- name: Task",
          outline: "1. Outline",
        });

        const result = await generateRole(
          mockApiInstance as unknown as LightSpeedAPI,
          undefined, // no name provided
          testText,
          "",
          testGenerationId,
        );

        expect(result).toMatchObject({
          name: "generated-role",
        });
      });

      it("should return error when generateRole throws", async () => {
        vi.mocked(
          lightSpeedManager.providerManager.generateRole,
        ).mockRejectedValue(new Error("Role generation error"));

        const result = await generateRole(
          mockApiInstance as unknown as LightSpeedAPI,
          testName,
          testText,
          "",
          testGenerationId,
        );

        expect(result).toEqual({
          message: "Role generation error",
          code: "GENERATION_ERROR",
        });
      });
    });
  });

  describe("thumbsUpDown", () => {
    it("should execute playbook thumbsUpDown command for playbook type", async () => {
      await thumbsUpDown(
        ThumbsUpDownAction.UP,
        "explanation-id-123",
        "playbook",
      );

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.thumbsUpDown",
        {
          action: ThumbsUpDownAction.UP,
          explanationId: "explanation-id-123",
        },
      );
    });

    it("should execute role thumbsUpDown command for role type", async () => {
      await thumbsUpDown(
        ThumbsUpDownAction.DOWN,
        "role-explanation-id",
        "role",
      );

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.roleThumbsUpDown",
        {
          action: ThumbsUpDownAction.DOWN,
          explanationId: "role-explanation-id",
        },
      );
    });

    it("should default to playbook type when not specified", async () => {
      await thumbsUpDown(ThumbsUpDownAction.UP, "explanation-id");

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.thumbsUpDown",
        {
          action: ThumbsUpDownAction.UP,
          explanationId: "explanation-id",
        },
      );
    });
  });

  describe("contentMatch", () => {
    it("should set suggestionDetails and execute command", () => {
      const generationId = "gen-id-123";
      const playbook = "---\n- name: Test playbook";

      // Suppress console.log during test
      // eslint-disable-next-line no-empty-function
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      contentMatch(generationId, playbook);

      expect(
        lightSpeedManager.contentMatchesProvider.suggestionDetails,
      ).toEqual([
        {
          suggestionId: generationId,
          suggestion: playbook,
          isPlaybook: true,
        },
      ]);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.fetchTrainingMatches",
      );

      consoleSpy.mockRestore();
    });
  });

  describe("updatePromptHistory", () => {
    it("should add new prompt to history", () => {
      const mockContext = {
        workspaceState: {
          get: vi.fn().mockReturnValue(["prompt1", "prompt2"]),
          update: vi.fn(),
        },
      } as unknown as vscode.ExtensionContext;

      updatePromptHistory(mockContext, "new prompt");

      expect(mockContext.workspaceState.get).toHaveBeenCalledWith(
        "ansible.lightspeed.recent_prompts",
        [],
      );
      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
        "ansible.lightspeed.recent_prompts",
        ["prompt1", "prompt2", "new prompt"],
      );
    });

    it("should not duplicate existing prompt, but move it to end", () => {
      const mockContext = {
        workspaceState: {
          get: vi.fn().mockReturnValue(["prompt1", "duplicate", "prompt2"]),
          update: vi.fn(),
        },
      } as unknown as vscode.ExtensionContext;

      updatePromptHistory(mockContext, "duplicate");

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
        "ansible.lightspeed.recent_prompts",
        ["prompt1", "prompt2", "duplicate"],
      );
    });

    it("should limit history to 500 entries", () => {
      const manyPrompts = Array.from({ length: 510 }, (_, i) => `prompt${i}`);
      const mockContext = {
        workspaceState: {
          get: vi.fn().mockReturnValue(manyPrompts),
          update: vi.fn(),
        },
      } as unknown as vscode.ExtensionContext;

      updatePromptHistory(mockContext, "new prompt");

      const updateCall = mockContext.workspaceState.update as ReturnType<
        typeof vi.fn
      >;
      const savedPrompts = updateCall.mock.calls[0][1] as string[];
      expect(savedPrompts.length).toBe(500);
      expect(savedPrompts[savedPrompts.length - 1]).toBe("new prompt");
    });

    it("should handle empty history", () => {
      const mockContext = {
        workspaceState: {
          get: vi.fn().mockReturnValue([]),
          update: vi.fn(),
        },
      } as unknown as vscode.ExtensionContext;

      updatePromptHistory(mockContext, "first prompt");

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
        "ansible.lightspeed.recent_prompts",
        ["first prompt"],
      );
    });
  });
});
