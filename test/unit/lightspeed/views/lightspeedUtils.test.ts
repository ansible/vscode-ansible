import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generatePlaybook,
  explainPlaybook,
  generateRole,
  explainRole,
} from "@src/features/lightspeed/vue/views/lightspeedUtils";
import type {
  PlaybookGenerationResponseParams,
  RoleGenerationResponseParams,
  ExplanationResponseParams,
  GenerationListEntry,
} from "@src/interfaces/lightspeed";
import { RoleFileType } from "@src/interfaces/lightspeed";
import type { LightSpeedAPI } from "@src/features/lightspeed/api";
import { IError, isError } from "@src/features/lightspeed/utils/errors";
import {
  TEST_PROMPTS,
  TEST_CONTENT,
  PROVIDER_TYPES,
  ANSIBLE_CONTENT,
} from "@test/unit/lightspeed/testConstants";

// Mock extension module - use string literal to avoid hoisting issues
vi.mock("@src/extension", () => {
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
import { lightSpeedManager } from "@src/extension";

describe("lightspeedUtils", () => {
  let mockApiInstance: LightSpeedAPI;
  let mockProviderManager: typeof lightSpeedManager.providerManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset provider to Google
    lightSpeedManager.settingsManager.settings.lightSpeedService.provider =
      PROVIDER_TYPES.GOOGLE;

    // Get references to mocks
    mockApiInstance = lightSpeedManager.apiInstance as LightSpeedAPI;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    mockProviderManager = lightSpeedManager.providerManager!;
  });

  describe("generatePlaybook", () => {
    it("should generate playbook using Google provider when provider is Google", async () => {
      const mockLLMResponse = {
        content: TEST_CONTENT.PLAYBOOK,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
      };

      const generatePlaybookMock = vi.mocked(
        mockProviderManager.generatePlaybook,
      );
      generatePlaybookMock.mockResolvedValue(mockLLMResponse);

      const result = await generatePlaybook(
        mockApiInstance,
        TEST_PROMPTS.INSTALL_NGINX,
        "",
        "test-generation-id",
      );

      expect(generatePlaybookMock).toHaveBeenCalledWith({
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

      const generatePlaybook2 = vi.mocked(mockProviderManager.generatePlaybook);
      generatePlaybook2.mockResolvedValue(mockLLMResponse);

      const result = await generatePlaybook(
        mockApiInstance,
        TEST_PROMPTS.INSTALL_NGINX,
        customOutline,
        "test-generation-id",
      );

      expect(generatePlaybook2).toHaveBeenCalledWith({
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
      const generatePlaybook3 = vi.mocked(mockProviderManager.generatePlaybook);
      generatePlaybook3.mockRejectedValue(new Error(errorMessage));

      const result = await generatePlaybook(
        mockApiInstance,
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

      const playbookGenerationRequest = vi.mocked(
        mockApiInstance.playbookGenerationRequest,
      );
      playbookGenerationRequest.mockResolvedValue(mockWCAResponse);

      const result = await generatePlaybook(
        mockApiInstance,
        TEST_PROMPTS.INSTALL_NGINX,
        "",
        "test-generation-id",
      );

      expect(playbookGenerationRequest).toHaveBeenCalledWith({
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

      const chatRequest = vi.mocked(mockProviderManager.chatRequest);
      chatRequest.mockResolvedValue(mockChatResponse);

      const result = await explainPlaybook(
        mockApiInstance,
        playbookContent,
        explanationId,
      );

      expect(chatRequest).toHaveBeenCalledWith({
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
      const chatRequest2 = vi.mocked(mockProviderManager.chatRequest);
      chatRequest2.mockRejectedValue(new Error(errorMessage));

      const result = await explainPlaybook(
        mockApiInstance,
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

      const explanationRequest = vi.mocked(mockApiInstance.explanationRequest);
      explanationRequest.mockResolvedValue(mockWCAResponse);

      const result = await explainPlaybook(
        mockApiInstance,
        playbookContent,
        explanationId,
      );

      expect(explanationRequest).toHaveBeenCalledWith({
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

      const generateRoleMock = vi.mocked(mockProviderManager.generateRole);
      generateRoleMock.mockResolvedValue(mockLLMResponse);

      const result = await generateRole(
        mockApiInstance,
        roleName,
        TEST_PROMPTS.CREATE_ROLE,
        "",
        "test-generation-id",
      );

      expect(generateRoleMock).toHaveBeenCalledWith({
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
            file_type: RoleFileType.Task,
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

      const generateRole2 = vi.mocked(mockProviderManager.generateRole);
      generateRole2.mockResolvedValue(mockLLMResponse);

      const result = await generateRole(
        mockApiInstance,
        roleName,
        TEST_PROMPTS.CREATE_ROLE,
        customOutline,
        "test-generation-id",
      );

      expect(generateRole2).toHaveBeenCalledWith({
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

      const generateRole3 = vi.mocked(mockProviderManager.generateRole);
      generateRole3.mockResolvedValue(mockLLMResponse);

      const result = await generateRole(
        mockApiInstance,
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
      const generateRole4 = vi.mocked(mockProviderManager.generateRole);
      generateRole4.mockRejectedValue(new Error(errorMessage));

      const result = await generateRole(
        mockApiInstance,
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
            file_type: RoleFileType.Task,
          },
        ],
        name: roleName,
        outline: TEST_CONTENT.OUTLINE_DEFAULT,
        generationId: "wca-test-id",
      };

      const roleGenerationRequest = vi.mocked(
        mockApiInstance.roleGenerationRequest,
      );
      roleGenerationRequest.mockResolvedValue(mockWCAResponse);

      const result = await generateRole(
        mockApiInstance,
        roleName,
        TEST_PROMPTS.CREATE_ROLE,
        "",
        "test-generation-id",
      );

      expect(roleGenerationRequest).toHaveBeenCalledWith({
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
          file_type: RoleFileType.Task,
        },
      ];
      const roleName = "test-role";
      const explanationId = "test-explanation-id";
      const mockChatResponse = {
        message: "This role installs and configures nginx.",
        conversationId: explanationId,
      };

      const chatRequest3 = vi.mocked(mockProviderManager.chatRequest);
      chatRequest3.mockResolvedValue(mockChatResponse);

      const result = await explainRole(
        mockApiInstance,
        roleFiles,
        roleName,
        explanationId,
      );

      expect(chatRequest3).toHaveBeenCalledWith({
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
          file_type: RoleFileType.Task,
        },
        {
          path: "handlers/main.yml",
          content: "- name: restart nginx",
          file_type: RoleFileType.Handler,
        },
      ];
      const roleName = "test-role";
      const explanationId = "test-explanation-id";
      const mockChatResponse = {
        message: "This role has tasks and handlers.",
        conversationId: explanationId,
      };

      const chatRequest4 = vi.mocked(mockProviderManager.chatRequest);
      chatRequest4.mockResolvedValue(mockChatResponse);

      const result = await explainRole(
        mockApiInstance,
        roleFiles,
        roleName,
        explanationId,
      );

      const expectedMessage = expect.stringContaining("tasks/main.yml");
      expect(chatRequest4).toHaveBeenCalledWith({
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
          file_type: RoleFileType.Task,
        },
      ];
      const errorMessage = "Role explanation failed";
      const chatRequest5 = vi.mocked(mockProviderManager.chatRequest);
      chatRequest5.mockRejectedValue(new Error(errorMessage));

      const result = await explainRole(
        mockApiInstance,
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
          file_type: RoleFileType.Task,
        },
      ];
      const roleName = "test-role";
      const explanationId = "test-explanation-id";
      const mockWCAResponse: ExplanationResponseParams = {
        content: "This role installs nginx.",
        format: "markdown",
        explanationId: explanationId,
      };

      const roleExplanationRequest = vi.mocked(
        mockApiInstance.roleExplanationRequest,
      );
      roleExplanationRequest.mockResolvedValue(mockWCAResponse);

      const result = await explainRole(
        mockApiInstance,
        roleFiles,
        roleName,
        explanationId,
      );

      expect(roleExplanationRequest).toHaveBeenCalledWith({
        files: roleFiles,
        roleName: roleName,
        explanationId: explanationId,
      });

      expect(result).toEqual(mockWCAResponse);
    });
  });
});
