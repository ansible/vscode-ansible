import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import {
  generatePlaybook,
  explainPlaybook,
  generateRole,
  explainRole,
} from "../../../../../src/features/lightspeed/vue/views/lightspeedUtils";
import type {
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
  ExplanationResponseParams,
  GenerationListEntry,
} from "../../../../../src/interfaces/lightspeed";
import {
  IError,
  isError,
} from "../../../../../src/features/lightspeed/utils/errors";
import {
  TEST_PROMPTS,
  TEST_CONTENT,
  TEST_LIGHTSPEED_SETTINGS,
  PROVIDER_TYPES,
  ANSIBLE_CONTENT,
} from "../testConstants";

// Mock extension module - use string literal to avoid hoisting issues
vi.mock("../../../../../src/extension", () => {
  return {
    lightSpeedManager: {
      apiInstance: {
        playbookGenerationRequest: vi.fn(),
        roleGenerationRequest: vi.fn(),
        explanationRequest: vi.fn(),
        roleExplanationRequest: vi.fn(),
      },
      providerManager: {
        generatePlaybook: vi.fn(),
        generateRole: vi.fn(),
        chatRequest: vi.fn(),
      },
      settingsManager: {
        settings: {
          lightSpeedService: {
            provider: "google",
          },
        },
      },
      contentMatchesProvider: {
        suggestionDetails: [],
      },
    },
  };
});

// Mock vscode commands
vi.mock("vscode", async () => {
  const actual = await vi.importActual("vscode");
  return {
    ...actual,
    commands: {
      executeCommand: vi.fn(),
    },
  };
});

// Import after mocks
import { lightSpeedManager } from "../../../../../src/extension";
import { commands } from "vscode";

describe("lightspeedUtils", () => {
  let mockApiInstance: typeof lightSpeedManager.apiInstance;
  let mockProviderManager: typeof lightSpeedManager.providerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset provider to Google
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
      PROVIDER_TYPES.GOOGLE;

    // Get references to mocks
    mockApiInstance = lightSpeedManager.apiInstance;
    mockProviderManager = lightSpeedManager.providerManager!;
  });

  describe("generatePlaybook", () => {
    it("should generate playbook using Google provider when provider is Google", async () => {
      const mockLLMResponse = {
        content: TEST_CONTENT.PLAYBOOK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
      };

      vi.mocked(mockProviderManager.generatePlaybook).mockResolvedValue(
        mockLLMResponse,
      );

      const result = await generatePlaybook(
        mockApiInstance as any,
        TEST_PROMPTS.INSTALL_NGINX,
        "",
        "test-generation-id",
      );

      expect(mockProviderManager.generatePlaybook).toHaveBeenCalledWith({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        createOutline: true,
        outline: undefined,
      });

      expect(result).toEqual({
        playbook: mockLLMResponse.content,
        outline: mockLLMResponse.outline,
        generationId: "test-generation-id",
      });
    });

    it("should generate playbook with custom outline using Google provider", async () => {
      const customOutline = "1. Install package\n2. Start service";
      const mockLLMResponse = {
        content: TEST_CONTENT.PLAYBOOK,
        outline: customOutline,
      };

      vi.mocked(mockProviderManager.generatePlaybook).mockResolvedValue(
        mockLLMResponse,
      );

      const result = await generatePlaybook(
        mockApiInstance as any,
        TEST_PROMPTS.INSTALL_NGINX,
        customOutline,
        "test-generation-id",
      );

      expect(mockProviderManager.generatePlaybook).toHaveBeenCalledWith({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        createOutline: false,
        outline: customOutline,
      });

      expect(result).toEqual({
        playbook: mockLLMResponse.content,
        outline: mockLLMResponse.outline,
        generationId: "test-generation-id",
      });
    });

    it("should handle errors from Google provider and return error response", async () => {
      const errorMessage = "API rate limit exceeded";
      vi.mocked(mockProviderManager.generatePlaybook).mockRejectedValue(
        new Error(errorMessage),
      );

      const result = await generatePlaybook(
        mockApiInstance as any,
        TEST_PROMPTS.INSTALL_NGINX,
        "",
        "test-generation-id",
      );

      expect(result).toEqual({
        message: errorMessage,
        code: "GENERATION_ERROR",
      } as IError);
    });

    it("should fallback to WCA provider when provider is WCA", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
        PROVIDER_TYPES.WCA;

      const mockWCAResponse: PlaybookGenerationResponseParams = {
        playbook: TEST_CONTENT.PLAYBOOK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        generationId: "wca-test-id",
      };

      vi.mocked(mockApiInstance.playbookGenerationRequest).mockResolvedValue(
        mockWCAResponse,
      );

      const result = await generatePlaybook(
        mockApiInstance as any,
        TEST_PROMPTS.INSTALL_NGINX,
        "",
        "test-generation-id",
      );

      expect(mockApiInstance.playbookGenerationRequest).toHaveBeenCalledWith({
        text: TEST_PROMPTS.INSTALL_NGINX,
        outline: undefined,
        createOutline: true,
        generationId: "test-generation-id",
      });

      expect(result).toEqual(mockWCAResponse);
    });
  });

  describe("explainPlaybook", () => {
    it("should explain playbook using Google provider when provider is Google", async () => {
      const playbookContent = ANSIBLE_CONTENT.PLAYBOOK;
      const explanationId = "test-explanation-id";
      const mockChatResponse = {
        message: "This playbook installs nginx on all hosts.",
        conversationId: explanationId,
      };

      vi.mocked(mockProviderManager.chatRequest).mockResolvedValue(
        mockChatResponse,
      );

      const result = await explainPlaybook(
        mockApiInstance as any,
        playbookContent,
        explanationId,
      );

      expect(mockProviderManager.chatRequest).toHaveBeenCalledWith({
        message: expect.stringContaining(playbookContent),
        conversationId: explanationId,
        metadata: { isExplanation: true },
      });

      expect(result).toEqual({
        content: mockChatResponse.message,
        format: "markdown",
        explanationId: explanationId,
      });
    });

    it("should handle errors from Google provider and return error response", async () => {
      const playbookContent = ANSIBLE_CONTENT.PLAYBOOK;
      const errorMessage = "Explanation service unavailable";
      vi.mocked(mockProviderManager.chatRequest).mockRejectedValue(
        new Error(errorMessage),
      );

      const result = await explainPlaybook(
        mockApiInstance as any,
        playbookContent,
        "test-explanation-id",
      );

      expect(result).toEqual({
        message: errorMessage,
        code: "EXPLANATION_ERROR",
      } as IError);
    });

    it("should fallback to WCA provider when provider is WCA", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
        PROVIDER_TYPES.WCA;

      const playbookContent = ANSIBLE_CONTENT.PLAYBOOK;
      const explanationId = "test-explanation-id";
      const mockWCAResponse: ExplanationResponseParams = {
        content: "This playbook installs nginx.",
        format: "markdown",
        explanationId: explanationId,
      };

      vi.mocked(mockApiInstance.explanationRequest).mockResolvedValue(
        mockWCAResponse,
      );

      const result = await explainPlaybook(
        mockApiInstance as any,
        playbookContent,
        explanationId,
      );

      expect(mockApiInstance.explanationRequest).toHaveBeenCalledWith({
        content: playbookContent,
        explanationId: explanationId,
      });

      expect(result).toEqual(mockWCAResponse);
    });
  });

  describe("generateRole", () => {
    it("should generate role using Google provider when provider is Google", async () => {
      const roleName = "test-role";
      const mockLLMResponse = {
        content: ANSIBLE_CONTENT.SINGLE_TASK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
      };

      vi.mocked(mockProviderManager.generateRole).mockResolvedValue(
        mockLLMResponse,
      );

      const result = await generateRole(
        mockApiInstance as any,
        roleName,
        TEST_PROMPTS.CREATE_ROLE,
        "",
        "test-generation-id",
      );

      expect(mockProviderManager.generateRole).toHaveBeenCalledWith({
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        createOutline: true,
        outline: undefined,
      });

      expect(result).toEqual({
        role: mockLLMResponse.content,
        files: [
          {
            path: "tasks/main.yml",
            content: mockLLMResponse.content,
            file_type: "task" as any,
          },
        ],
        name: roleName,
        outline: mockLLMResponse.outline,
        generationId: "test-generation-id",
      });
    });

    it("should generate role with custom outline using Google provider", async () => {
      const roleName = "test-role";
      const customOutline = "1. Setup task\n2. Configure task";
      const mockLLMResponse = {
        content: ANSIBLE_CONTENT.MULTI_TASK,
        outline: customOutline,
      };

      vi.mocked(mockProviderManager.generateRole).mockResolvedValue(
        mockLLMResponse,
      );

      const result = await generateRole(
        mockApiInstance as any,
        roleName,
        TEST_PROMPTS.CREATE_ROLE,
        customOutline,
        "test-generation-id",
      );

      expect(mockProviderManager.generateRole).toHaveBeenCalledWith({
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        createOutline: false,
        outline: customOutline,
      });

      expect(isError(result)).toBe(false);
      if (!isError(result)) {
        expect(result.files).toHaveLength(1);
        expect(result.files[0].path).toBe("tasks/main.yml");
        expect(result.files[0].content).toBe(mockLLMResponse.content);
      }
    });

    it("should use default role name when name is undefined", async () => {
      const mockLLMResponse = {
        content: ANSIBLE_CONTENT.SINGLE_TASK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
      };

      vi.mocked(mockProviderManager.generateRole).mockResolvedValue(
        mockLLMResponse,
      );

      const result = await generateRole(
        mockApiInstance as any,
        undefined,
        TEST_PROMPTS.CREATE_ROLE,
        "",
        "test-generation-id",
      );

      expect(isError(result)).toBe(false);
      if (!isError(result)) {
        expect(result.name).toBe("generated-role");
      }
    });

    it("should handle errors from Google provider and return error response", async () => {
      const errorMessage = "Role generation failed";
      vi.mocked(mockProviderManager.generateRole).mockRejectedValue(
        new Error(errorMessage),
      );

      const result = await generateRole(
        mockApiInstance as any,
        "test-role",
        TEST_PROMPTS.CREATE_ROLE,
        "",
        "test-generation-id",
      );

      expect(result).toEqual({
        message: errorMessage,
        code: "GENERATION_ERROR",
      } as IError);
    });

    it("should fallback to WCA provider when provider is WCA", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
        PROVIDER_TYPES.WCA;

      const roleName = "test-role";
      const mockWCAResponse: RoleGenerationResponseParams = {
        role: ANSIBLE_CONTENT.SINGLE_TASK,
        files: [
          {
            path: "tasks/main.yml",
            content: ANSIBLE_CONTENT.SINGLE_TASK,
            file_type: "task" as any,
          },
        ],
        name: roleName,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        generationId: "wca-test-id",
      };

      vi.mocked(mockApiInstance.roleGenerationRequest).mockResolvedValue(
        mockWCAResponse,
      );

      const result = await generateRole(
        mockApiInstance as any,
        roleName,
        TEST_PROMPTS.CREATE_ROLE,
        "",
        "test-generation-id",
      );

      expect(mockApiInstance.roleGenerationRequest).toHaveBeenCalledWith({
        text: TEST_PROMPTS.CREATE_ROLE,
        outline: undefined,
        createOutline: true,
        generationId: "test-generation-id",
        name: roleName,
      });

      expect(result).toEqual(mockWCAResponse);
    });
  });

  describe("explainRole", () => {
    it("should explain role using Google provider when provider is Google", async () => {
      const roleFiles: GenerationListEntry[] = [
        {
          path: "tasks/main.yml",
          content: ANSIBLE_CONTENT.SINGLE_TASK,
          file_type: "task" as any,
        },
      ];
      const roleName = "test-role";
      const explanationId = "test-explanation-id";
      const mockChatResponse = {
        message: "This role installs and configures nginx.",
        conversationId: explanationId,
      };

      vi.mocked(mockProviderManager.chatRequest).mockResolvedValue(
        mockChatResponse,
      );

      const result = await explainRole(
        mockApiInstance as any,
        roleFiles,
        roleName,
        explanationId,
      );

      expect(mockProviderManager.chatRequest).toHaveBeenCalledWith({
        message: expect.stringContaining(roleFiles[0].path),
        conversationId: explanationId,
        metadata: {
          isExplanation: true,
          ansibleFileType: "tasks",
        },
      });

      expect(result).toEqual({
        content: mockChatResponse.message,
        format: "markdown",
        explanationId: explanationId,
      });
    });

    it("should combine multiple role files for explanation", async () => {
      const roleFiles: GenerationListEntry[] = [
        {
          path: "tasks/main.yml",
          content: ANSIBLE_CONTENT.SINGLE_TASK,
          file_type: "task" as any,
        },
        {
          path: "handlers/main.yml",
          content: "- name: restart nginx",
          file_type: "handler" as any,
        },
      ];
      const roleName = "test-role";
      const explanationId = "test-explanation-id";
      const mockChatResponse = {
        message: "This role has tasks and handlers.",
        conversationId: explanationId,
      };

      vi.mocked(mockProviderManager.chatRequest).mockResolvedValue(
        mockChatResponse,
      );

      const result = await explainRole(
        mockApiInstance as any,
        roleFiles,
        roleName,
        explanationId,
      );

      const expectedMessage = expect.stringContaining("tasks/main.yml");
      expect(mockProviderManager.chatRequest).toHaveBeenCalledWith({
        message: expectedMessage,
        conversationId: explanationId,
        metadata: {
          isExplanation: true,
          ansibleFileType: "tasks",
        },
      });

      expect(result).toEqual({
        content: mockChatResponse.message,
        format: "markdown",
        explanationId: explanationId,
      });
    });

    it("should handle errors from Google provider and return error response", async () => {
      const roleFiles: GenerationListEntry[] = [
        {
          path: "tasks/main.yml",
          content: ANSIBLE_CONTENT.SINGLE_TASK,
          file_type: "task" as any,
        },
      ];
      const errorMessage = "Role explanation failed";
      vi.mocked(mockProviderManager.chatRequest).mockRejectedValue(
        new Error(errorMessage),
      );

      const result = await explainRole(
        mockApiInstance as any,
        roleFiles,
        "test-role",
        "test-explanation-id",
      );

      expect(result).toEqual({
        message: errorMessage,
        code: "EXPLANATION_ERROR",
      } as IError);
    });

    it("should fallback to WCA provider when provider is WCA", async () => {
      lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
        PROVIDER_TYPES.WCA;

      const roleFiles: GenerationListEntry[] = [
        {
          path: "tasks/main.yml",
          content: ANSIBLE_CONTENT.SINGLE_TASK,
          file_type: "task" as any,
        },
      ];
      const roleName = "test-role";
      const explanationId = "test-explanation-id";
      const mockWCAResponse: ExplanationResponseParams = {
        content: "This role installs nginx.",
        format: "markdown",
        explanationId: explanationId,
      };

      vi.mocked(mockApiInstance.roleExplanationRequest).mockResolvedValue(
        mockWCAResponse,
      );

      const result = await explainRole(
        mockApiInstance as any,
        roleFiles,
        roleName,
        explanationId,
      );

      expect(mockApiInstance.roleExplanationRequest).toHaveBeenCalledWith({
        files: roleFiles,
        roleName: roleName,
        explanationId: explanationId,
      });

      expect(result).toEqual(mockWCAResponse);
    });
  });
});
