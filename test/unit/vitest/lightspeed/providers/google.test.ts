import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Module from "module";

// Mock AnsibleContextProcessor
const mockEnhancePromptForAnsible = vi.fn((prompt: string, context?: string, ansibleContext?: any) => {
  return `enhanced: ${prompt} with context: ${context || "none"}`;
});

const mockCleanAnsibleOutput = vi.fn((output: string) => {
  return output.trim().replace(/^```ya?ml\s*/i, "").replace(/```\s*$/, "");
});

const mockAnsibleContextModule = {
  AnsibleContextProcessor: {
    enhancePromptForAnsible: mockEnhancePromptForAnsible,
    cleanAnsibleOutput: mockCleanAnsibleOutput,
  },
};

// Store original require
const originalRequire = Module.prototype.require;

// Patch require() to intercept module imports - must happen before imports
Module.prototype.require = function (this: any, id: string) {
  const normalizedId = id.replace(/\\/g, "/");
  if (
    id === "../ansibleContext" ||
    normalizedId === "../ansibleContext" ||
    normalizedId.endsWith("/ansibleContext") ||
    normalizedId.endsWith("/ansibleContext.js") ||
    normalizedId.includes("/ansibleContext") ||
    normalizedId.includes("ansibleContext.js")
  ) {
    return mockAnsibleContextModule;
  }
  return originalRequire.call(this, id);
} as any;

vi.mock("@google/genai", () => {
  // Create a proper constructor class that can be instantiated with 'new'
  const generateContentMock = vi.fn();
  
  class MockGoogleGenAI {
    models = {
      generateContent: generateContentMock,
    };
    
    constructor(_config: { apiKey: string }) {
      // Constructor can be empty, just needs to be callable with 'new'
    }
  }
  
  // Export the mock so we can access it in tests
  (MockGoogleGenAI as any).__generateContentMock = generateContentMock;
  
  return {
    GoogleGenAI: MockGoogleGenAI,
  };
});

vi.mock("../../../../../src/utils/logger", () => {
  // Create a shared logger mock inside the factory
  const loggerMock = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  
  return {
    getLightspeedLogger: vi.fn(() => loggerMock),
    __loggerMock: loggerMock, // Export for test access
  };
});

vi.mock("../../../../../src/features/lightspeed/utils/outlineGenerator", () => ({
  generateOutlineFromPlaybook: vi.fn((playbook: string) => {
    return "1. Task one\n2. Task two";
  }),
  generateOutlineFromRole: vi.fn((role: string) => {
    return "1. Setup task\n2. Configure task";
  }),
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockEnhancePromptForAnsible.mockImplementation(
    (prompt: string, context?: string, ansibleContext?: any) => {
      return `enhanced: ${prompt} with context: ${context || "none"}`;
    },
  );
  mockCleanAnsibleOutput.mockImplementation((output: string) => {
    return output.trim().replace(/^```ya?ml\s*/i, "").replace(/```\s*$/, "");
  });
  
  // Setup shared generateContent mock with default response
  sharedGenerateContent.mockResolvedValue({
    text: "---\n- name: test playbook\n  hosts: all",
  });
  
  mockedGenerateOutlineFromPlaybook.mockReturnValue("1. Task one\n2. Task two");
  mockedGenerateOutlineFromRole.mockReturnValue("1. Setup task\n2. Configure task");
});

import { GoogleProvider } from "../../../../../src/features/lightspeed/providers/google.js";
import type {
  CompletionRequestParams,
  CompletionResponseParams,
} from "../../../../../src/interfaces/lightspeed.js";
import type {
  ChatRequestParams,
  GenerationRequestParams,
} from "../../../../../src/features/lightspeed/providers/base.js";
import {
  TEST_API_KEYS,
  MODEL_NAMES,
  TEST_PROMPTS,
  TEST_CONTENT,
  GOOGLE_PROVIDER,
  HTTP_STATUS_CODES,
} from "../testConstants.js";

// Get the mocked modules
import { GoogleGenAI } from "@google/genai";
import { getLightspeedLogger } from "../../../../../src/utils/logger.js";
import {
  generateOutlineFromPlaybook,
  generateOutlineFromRole,
} from "../../../../../src/features/lightspeed/utils/outlineGenerator.js";

// Access the actual mocks from the mocked modules using vi.mocked
const mockedGenerateOutlineFromPlaybook = vi.mocked(generateOutlineFromPlaybook);
const mockedGenerateOutlineFromRole = vi.mocked(generateOutlineFromRole);

// Get the logger mock - call getLightspeedLogger to get the mocked instance
const mockedGetLightspeedLogger = vi.mocked(getLightspeedLogger);
const mockedLogger = mockedGetLightspeedLogger();

// Get the generateContent mock from the GoogleGenAI mock
const sharedGenerateContent = (GoogleGenAI as any).__generateContentMock as ReturnType<typeof vi.fn>;

describe("GoogleProvider", () => {
  describe("Constructor", () => {
    it("should initialize with config and log model name", () => {
      const config = {
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      };
      const provider = new GoogleProvider(config);

      expect(provider.name).toBe(GOOGLE_PROVIDER.NAME);
      expect(provider.displayName).toBe(GOOGLE_PROVIDER.DISPLAY_NAME);
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(MODEL_NAMES.GEMINI_25_FLASH),
      );
      expect(sharedGenerateContent).toBeDefined();
    });
  });

  describe("validateConfig and getStatus", () => {
    it("should validate config and return status", async () => {
      sharedGenerateContent.mockResolvedValue({
        text: "test response",
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_PRO,
      });

      const isValid = await provider.validateConfig();
      const status = await provider.getStatus();

      expect(isValid).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.modelInfo?.name).toBe(MODEL_NAMES.GEMINI_PRO);
      expect(status.modelInfo?.capabilities).toEqual([
        "completion",
        "chat",
        "generation",
      ]);
      expect(sharedGenerateContent).toHaveBeenCalledWith({
        model: MODEL_NAMES.GEMINI_PRO,
        contents: "test",
      });
    });

    it("should return false and disconnected status when API call fails", async () => {
      sharedGenerateContent.mockRejectedValue(new Error("Invalid API key"));
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });

      const isValid = await provider.validateConfig();
      const status = await provider.getStatus();

      expect(isValid).toBe(false);
      expect(status.connected).toBe(false);
      expect(status.error).toContain("API key");
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("completionRequest", () => {
    it("should return completion predictions with proper formatting", async () => {
      const mockResponse = "```yaml\n    - name: Install package\n      package:";
      sharedGenerateContent.mockResolvedValue({
        text: mockResponse,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });
      const params: CompletionRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        suggestionId: "test-suggestion-123",
      };

      const result = await provider.completionRequest(params);

      expect(result.predictions).toBeDefined();
      expect(Array.isArray(result.predictions)).toBe(true);
      expect(result.model).toBe(MODEL_NAMES.GEMINI_25_FLASH);
      expect(result.suggestionId).toBe("test-suggestion-123");
      expect(result.predictions[0]).not.toContain("```yaml");
      expect(result.predictions[0]).not.toContain("```");
      expect(sharedGenerateContent).toHaveBeenCalledWith({
        model: MODEL_NAMES.GEMINI_25_FLASH,
        contents: TEST_PROMPTS.INSTALL_NGINX,
        config: {
          systemInstruction: expect.stringContaining("Ansible code completion"),
        },
      });
    });

    it("should generate suggestionId when not provided", async () => {
      sharedGenerateContent.mockResolvedValue({
        text: "test completion",
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });
      const params: CompletionRequestParams = {
        prompt: TEST_PROMPTS.TEST_PROMPT,
      };

      const result = await provider.completionRequest(params);

      expect(result.suggestionId).toBeDefined();
      expect(result.suggestionId).toContain("google-");
    });

    it("should handle errors and throw with proper message", async () => {
      const error = new Error("API error");
      sharedGenerateContent.mockRejectedValue(error);
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });
      const params: CompletionRequestParams = {
        prompt: TEST_PROMPTS.TEST_PROMPT,
      };

      await expect(provider.completionRequest(params)).rejects.toThrow(
        "Google completion failed",
      );
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("chatRequest", () => {
    it("should return chat response with message", async () => {
      const mockResponse = "This is a helpful response";
      sharedGenerateContent.mockResolvedValue({
        text: mockResponse,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_PRO,
      });
      const params: ChatRequestParams = {
        message: "How do I install nginx?",
        conversationId: "conv-123",
      };

      const result = await provider.chatRequest(params);

      expect(result.message).toBe(mockResponse);
      expect(result.conversationId).toBe("conv-123");
      expect(result.model).toBe(MODEL_NAMES.GEMINI_PRO);
      expect(mockEnhancePromptForAnsible).toHaveBeenCalled();
    });

    it("should use correct system prompt based on isExplanation flag", async () => {
      sharedGenerateContent.mockResolvedValue({
        text: "Response",
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_PRO,
      });

      // Test explanation mode
      await provider.chatRequest({
        message: "Explain this task",
        metadata: { isExplanation: true },
      });
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("EXPLANATION"),
      );

      // Test chat mode
      await provider.chatRequest({
        message: "Hello",
        metadata: { isExplanation: false },
      });
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("CHAT"),
      );
    });

    it("should handle errors and throw with proper message", async () => {
      const error = { status: HTTP_STATUS_CODES.FORBIDDEN };
      sharedGenerateContent.mockRejectedValue(error);
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });
      const params: ChatRequestParams = {
        message: "Test message",
      };

      await expect(provider.chatRequest(params)).rejects.toThrow();
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("generatePlaybook", () => {
    it("should generate playbook content with proper config", async () => {
      const mockPlaybook = "---\n- name: Install nginx\n  hosts: all";
      sharedGenerateContent.mockResolvedValue({
        text: mockPlaybook,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_PRO,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      };

      const result = await provider.generatePlaybook(params);

      expect(result.content).toBeDefined();
      expect(result.model).toBe(MODEL_NAMES.GEMINI_PRO);
      expect(mockEnhancePromptForAnsible).toHaveBeenCalled();
      expect(mockCleanAnsibleOutput).toHaveBeenCalled();
      expect(sharedGenerateContent).toHaveBeenCalledWith({
        model: MODEL_NAMES.GEMINI_PRO,
        contents: expect.any(String),
        config: {
          systemInstruction: expect.any(String),
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      });
    });

    it("should generate outline when createOutline is true, otherwise not", async () => {
      const mockPlaybook = "---\n- name: Install nginx\n  hosts: all\n  tasks:\n    - name: Task one\n    - name: Task two";
      sharedGenerateContent.mockResolvedValue({
        text: mockPlaybook,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });

      // Test with outline
      const resultWithOutline = await provider.generatePlaybook({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        createOutline: true,
      });
      expect(resultWithOutline.outline).toBeDefined();
      expect(mockedGenerateOutlineFromPlaybook).toHaveBeenCalled();

      // Test without outline
      const resultWithoutOutline = await provider.generatePlaybook({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        createOutline: false,
      });
      expect(resultWithoutOutline.outline).toBe("");
    });

    it("should handle errors and throw with proper message", async () => {
      const error = { status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR };
      sharedGenerateContent.mockRejectedValue(error);
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      };

      await expect(provider.generatePlaybook(params)).rejects.toThrow();
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("generateRole", () => {
    it("should generate role content with proper config", async () => {
      const mockRole = "---\n- name: Setup role\n  tasks:";
      sharedGenerateContent.mockResolvedValue({
        text: mockRole,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_PRO,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
      };

      const result = await provider.generateRole(params);

      expect(result.content).toBeDefined();
      expect(result.model).toBe(MODEL_NAMES.GEMINI_PRO);
      expect(mockEnhancePromptForAnsible).toHaveBeenCalled();
      expect(mockCleanAnsibleOutput).toHaveBeenCalled();
      expect(sharedGenerateContent).toHaveBeenCalledWith({
        model: MODEL_NAMES.GEMINI_PRO,
        contents: expect.any(String),
        config: {
          systemInstruction: expect.any(String),
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      });
    });

    it("should generate outline when createOutline is true, otherwise not", async () => {
      const mockRole = "---\n- name: Setup task\n- name: Configure task";
      sharedGenerateContent.mockResolvedValue({
        text: mockRole,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });

      // Test with outline
      const resultWithOutline = await provider.generateRole({
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        createOutline: true,
      });
      expect(resultWithOutline.outline).toBeDefined();
      expect(mockedGenerateOutlineFromRole).toHaveBeenCalled();

      // Test without outline
      const resultWithoutOutline = await provider.generateRole({
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        createOutline: false,
      });
      expect(resultWithoutOutline.outline).toBe("");
    });

    it("should incorporate outline into prompt when provided", async () => {
      const outline = "1. Setup\n2. Configure";
      sharedGenerateContent.mockResolvedValue({
        text: TEST_CONTENT.ROLE,
      });
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_PRO,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        outline: outline,
      };

      await provider.generateRole(params);

      expect(mockEnhancePromptForAnsible).toHaveBeenCalledWith(
        expect.stringContaining(outline),
        expect.any(String),
        expect.objectContaining({
          fileType: "tasks",
        }),
      );
    });

    it("should handle errors and throw with proper message", async () => {
      const error = { status: HTTP_STATUS_CODES.SERVICE_UNAVAILABLE };
      sharedGenerateContent.mockRejectedValue(error);
      const provider = new GoogleProvider({
        apiKey: TEST_API_KEYS.GOOGLE,
        modelName: MODEL_NAMES.GEMINI_25_FLASH,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
      };

      await expect(provider.generateRole(params)).rejects.toThrow();
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

});
