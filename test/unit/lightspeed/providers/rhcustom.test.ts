import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Module from "module";

// Mock AnsibleContextProcessor
const mockEnhancePromptForAnsible = vi.fn(
  (prompt: string, context?: string) => {
    return `enhanced: ${prompt} with context: ${context || "none"}`;
  },
);

const mockCleanAnsibleOutput = vi.fn((output: string) => {
  return output
    .trim()
    .replace(/^```ya?ml\s*/i, "")
    .replace(/```\s*$/, "");
});

const mockAnsibleContextModule = {
  AnsibleContextProcessor: {
    enhancePromptForAnsible: mockEnhancePromptForAnsible,
    cleanAnsibleOutput: mockCleanAnsibleOutput,
  },
};

const originalRequire = Module.prototype.require.bind(Module.prototype);

Module.prototype.require = function (
  this: Module,
  id: string,
): ReturnType<typeof originalRequire> {
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
};

const { mockChatCompletion, MockOpenAICompatibleClient } = vi.hoisted(() => {
  const mockChatCompletion = vi.fn();
  const MockOpenAICompatibleClient = vi.fn().mockImplementation(function (
    this: { chatCompletion: ReturnType<typeof vi.fn> },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _config: unknown,
  ) {
    this.chatCompletion = mockChatCompletion;
    return this;
  });
  return { mockChatCompletion, MockOpenAICompatibleClient };
});

vi.mock("../../../../src/features/lightspeed/clients/openaiCompatibleClient", () => {
  return {
    OpenAICompatibleClient: MockOpenAICompatibleClient,
    OpenAIClientError: class OpenAIClientError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.name = "OpenAIClientError";
        this.status = status;
      }
    },
  };
});

vi.mock("../../../../src/utils/logger", () => {
  const loggerMock = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };

  return {
    getLightspeedLogger: vi.fn(() => loggerMock),
    __loggerMock: loggerMock,
  };
});

vi.mock("../../../../src/features/lightspeed/utils/outlineGenerator", () => ({
  generateOutlineFromPlaybook: vi.fn(() => {
    return "1. Task one\n2. Task two";
  }),
  generateOutlineFromRole: vi.fn(() => {
    return "1. Setup task\n2. Configure task";
  }),
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockEnhancePromptForAnsible.mockImplementation(
    (prompt: string, context?: string) => {
      return `enhanced: ${prompt} with context: ${context || "none"}`;
    },
  );
  mockCleanAnsibleOutput.mockImplementation((output: string) => {
    return output
      .trim()
      .replace(/^```ya?ml\s*/i, "")
      .replace(/```\s*$/, "");
  });

  mockChatCompletion.mockResolvedValue({
    id: "test-id",
    object: "chat.completion",
    created: Date.now(),
    model: "deepseek-model",
    choices: [
      {
        index: 0,
        message: {
          role: "system",
          content: "---\n- name: test playbook\n  hosts: all",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  });
});

import { RHCustomProvider } from "../../../../src/features/lightspeed/providers/rhcustom.js";
import type { CompletionRequestParams } from "../../../../src/interfaces/lightspeed.js";
import type {
  ChatRequestParams,
  GenerationRequestParams,
} from "../../../../src/features/lightspeed/providers/base.js";
import {
  TEST_API_KEYS,
  MODEL_NAMES,
  TEST_PROMPTS,
  TEST_CONTENT,
  RHCUSTOM_PROVIDER,
  HTTP_STATUS_CODES,
  API_ENDPOINTS,
  DEFAULT_TIMEOUTS,
} from "../testConstants.js";
import { OpenAIClientError } from "../../../../src/features/lightspeed/clients/openaiCompatibleClient.js";
import { getLightspeedLogger } from "../../../../src/utils/logger.js";
import {
  generateOutlineFromPlaybook,
  generateOutlineFromRole,
} from "../../../../src/features/lightspeed/utils/outlineGenerator.js";

const mockedGenerateOutlineFromPlaybook = vi.mocked(
  generateOutlineFromPlaybook,
);
const mockedGenerateOutlineFromRole = vi.mocked(generateOutlineFromRole);

const mockedGetLightspeedLogger = vi.mocked(getLightspeedLogger);
const mockedLogger = mockedGetLightspeedLogger();

describe("RHCustomProvider", () => {
  describe("Constructor", () => {
    it("should initialize with valid config", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      };
      const provider = new RHCustomProvider(config);

      expect(provider.name).toBe(RHCUSTOM_PROVIDER.NAME);
      expect(provider.displayName).toBe(RHCUSTOM_PROVIDER.DISPLAY_NAME);
    });

    it("should throw error when API key is missing", () => {
      const config = {
        apiKey: "",
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      };

      expect(() => {
        new RHCustomProvider(config);
      }).toThrow("API Key is required");
    });

    it("should throw error when model name is missing", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: "",
        baseURL: API_ENDPOINTS.RHCUSTOM,
      };

      expect(() => {
        new RHCustomProvider(config);
      }).toThrow("Model name is required");
    });

    it("should throw error when baseURL is missing", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: "",
      };

      expect(() => {
        new RHCustomProvider(config);
      }).toThrow("Base URL is required");
    });

    it("should throw error when baseURL is invalid", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: "not-a-valid-url",
      };

      expect(() => {
        new RHCustomProvider(config);
      }).toThrow("Invalid base URL format");
    });

    it("should throw error when baseURL uses non-http protocol", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: "ftp://example.com",
      };

      expect(() => {
        new RHCustomProvider(config);
      }).toThrow("Base URL must use http:// or https:// protocol");
    });

    it("should use custom timeout when provided", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
        timeout: DEFAULT_TIMEOUTS.CUSTOM,
      };
      const provider = new RHCustomProvider(config);

      expect((provider as unknown as { timeout: number }).timeout).toBe(
        DEFAULT_TIMEOUTS.CUSTOM,
      );
    });

    it("should use default timeout when not provided", () => {
      const config = {
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      };
      const provider = new RHCustomProvider(config);

      expect((provider as unknown as { timeout: number }).timeout).toBe(
        DEFAULT_TIMEOUTS.DEFAULT,
      );
    });
  });

  describe("validateConfig and getStatus", () => {
    it("should validate config and return status", async () => {
      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const isValid = await provider.validateConfig();
      const status = await provider.getStatus();

      expect(isValid).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.modelInfo?.name).toBe(MODEL_NAMES.RHCUSTOM_DEEPSEEK);
      expect(status.modelInfo?.capabilities).toEqual([
        "completion",
        "chat",
        "generation",
      ]);
      expect(mockChatCompletion).toHaveBeenCalled();
    });
  });

  describe("completionRequest", () => {
    it("should throw error indicating inline suggestions are not supported", async () => {
      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: CompletionRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        suggestionId: "test-suggestion-123",
      };

      await expect(provider.completionRequest(params)).rejects.toThrow(
        "Inline suggestions are not supported",
      );
      await expect(provider.completionRequest(params)).rejects.toThrow(
        "Red Hat Custom provider",
      );
    });
  });

  describe("chatRequest", () => {
    it("should return chat response with message", async () => {
      const mockResponse = "This is a helpful response";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_GRANITE,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockResponse,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_GRANITE,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: ChatRequestParams = {
        message: "How do I install nginx?",
        conversationId: "conv-123",
      };

      const result = await provider.chatRequest(params);

      expect(result.message).toBe(mockResponse);
      expect(result.conversationId).toBe("conv-123");
      expect(result.model).toBe(MODEL_NAMES.RHCUSTOM_GRANITE);
      expect(mockEnhancePromptForAnsible).toHaveBeenCalled();
    });

    it("should use explanation-specific system prompt when isExplanation is true", async () => {
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_GRANITE,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Explanation response",
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_GRANITE,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      await provider.chatRequest({
        message: "Explain this task",
        metadata: { isExplanation: true },
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("EXPLANATION"),
      );
    });

    it("should handle errors and throw with proper message", async () => {
      mockChatCompletion.mockRejectedValueOnce(
        new OpenAIClientError("Access denied", HTTP_STATUS_CODES.FORBIDDEN),
      );

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: ChatRequestParams = {
        message: "Test message",
      };

      await expect(provider.chatRequest(params)).rejects.toThrow();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("generatePlaybook", () => {
    it("should generate playbook content with proper config", async () => {
      const mockPlaybook = "---\n- name: Install nginx\n  hosts: all";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_GRANITE,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockPlaybook,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_GRANITE,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      };

      const result = await provider.generatePlaybook(params);

      expect(result.content).toBeDefined();
      expect(result.model).toBe(MODEL_NAMES.RHCUSTOM_GRANITE);
      expect(mockEnhancePromptForAnsible).toHaveBeenCalled();
      expect(mockCleanAnsibleOutput).toHaveBeenCalled();
    });

    it("should extract YAML from code blocks", async () => {
      const mockResponse =
        "```yaml\n---\n- name: Install nginx\n  hosts: all\n```\n\nThis installs nginx.";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockResponse,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const result = await provider.generatePlaybook({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      });

      expect(result.content).toContain("- name: Install nginx");
      expect(result.content).not.toContain("```yaml");
      expect(result.content).not.toContain("This installs nginx");
    });

    it("should generate outline when createOutline is true", async () => {
      const mockPlaybook =
        "---\n- name: Install nginx\n  hosts: all\n  tasks:\n    - name: Task one\n    - name: Task two";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockPlaybook,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const result = await provider.generatePlaybook({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        createOutline: true,
      });

      expect(result.outline).toBeDefined();
      expect(mockedGenerateOutlineFromPlaybook).toHaveBeenCalled();
    });

    it("should incorporate outline into prompt when provided", async () => {
      const outline = "1. Setup\n2. Configure";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_GRANITE,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: TEST_CONTENT.PLAYBOOK,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_GRANITE,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        outline: outline,
      };

      await provider.generatePlaybook(params);

      expect(mockEnhancePromptForAnsible).toHaveBeenCalledWith(
        expect.stringContaining(outline),
        expect.any(String),
        expect.objectContaining({
          fileType: "playbook",
        }),
      );
    });

    it("should handle errors and throw with proper message", async () => {
      mockChatCompletion.mockRejectedValueOnce(
        new OpenAIClientError(
          "Server error",
          HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
        ),
      );

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      };

      await expect(provider.generatePlaybook(params)).rejects.toThrow();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("generateRole", () => {
    it("should generate role content with proper config", async () => {
      const mockRole = "---\n- name: Setup role\n  tasks:";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_GRANITE,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockRole,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_GRANITE,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
      };

      const result = await provider.generateRole(params);

      expect(result.content).toBeDefined();
      expect(result.model).toBe(MODEL_NAMES.RHCUSTOM_GRANITE);
      expect(mockEnhancePromptForAnsible).toHaveBeenCalled();
      expect(mockCleanAnsibleOutput).toHaveBeenCalled();
    });

    it("should generate outline when createOutline is true", async () => {
      const mockRole = "---\n- name: Setup task\n- name: Configure task";
      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: mockRole,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const result = await provider.generateRole({
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        createOutline: true,
      });

      expect(result.outline).toBeDefined();
      expect(mockedGenerateOutlineFromRole).toHaveBeenCalled();
    });

    it("should handle errors and throw with proper message", async () => {
      mockChatCompletion.mockRejectedValueOnce(
        new OpenAIClientError(
          "Service unavailable",
          HTTP_STATUS_CODES.SERVICE_UNAVAILABLE,
        ),
      );

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
      };

      await expect(provider.generateRole(params)).rejects.toThrow();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe("Client integration", () => {
    it("should initialize client with correct configuration", () => {
      new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
        timeout: DEFAULT_TIMEOUTS.CUSTOM,
      });

      expect(MockOpenAICompatibleClient).toHaveBeenCalledWith({
        baseUrl: API_ENDPOINTS.RHCUSTOM,
        apiKey: TEST_API_KEYS.RHCUSTOM,
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        timeout: DEFAULT_TIMEOUTS.CUSTOM,
      });
    });

    it("should call client with correct messages for chat requests", async () => {
      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_GRANITE,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      await provider.chatRequest({
        message: "Test message",
        conversationId: "conv-123",
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
          }),
          expect.objectContaining({
            role: "user",
          }),
        ]),
      );
    });

    it("should call client with temperature and max_tokens for generation requests", async () => {
      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      await provider.generatePlaybook({
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          temperature: 0.3,
          max_tokens: 4000,
        }),
      );
    });

    it("should pass timeout to client for validation", async () => {
      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
        timeout: DEFAULT_TIMEOUTS.CUSTOM,
      });

      await provider.validateConfig();

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          timeout: expect.any(Number),
        }),
      );
    });
  });

  describe("fixWindowsPathEscapes", () => {
    it("should fix unescaped backslashes in Windows paths", async () => {
      const mockResponseWithWindowsPath = `---\n- name: Create IIS website
  community.windows.win_iis_website:
    iis_physical_path: "C:\\inetpub\\wwwroot\\website1"
    iis_bindings:
      - protocol: "http"
        port: "8080"`;

      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `\`\`\`yaml\n${mockResponseWithWindowsPath}\n\`\`\``,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const result = await provider.generateRole({
        prompt: "Create IIS website",
        type: "role",
        createOutline: true,
      });

      // The content should have properly escaped backslashes
      expect(result.content).toContain("C:\\\\inetpub\\\\wwwroot\\\\website1");
      // Should not contain unescaped backslashes that would cause YAML parsing errors
      expect(result.content).not.toContain('"C:\\inetpub');
    });

    it("should not break valid escape sequences", async () => {
      const mockResponse = `---\n- name: Test task
  debug:
    msg: "Line 1\\nLine 2\\tTabbed"`;

      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `\`\`\`yaml\n${mockResponse}\n\`\`\``,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const result = await provider.generatePlaybook({
        prompt: "Test task",
        type: "playbook",
      });

      // Valid escape sequences like \n and \t should remain unchanged
      expect(result.content).toContain("\\n");
      expect(result.content).toContain("\\t");
    });

    it("should handle Windows paths in playbook generation", async () => {
      const mockResponse = `---\n- name: Configure Windows service
  win_service:
    name: MyService
    path: "C:\\Program Files\\MyApp\\service.exe"`;

      mockChatCompletion.mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `\`\`\`yaml\n${mockResponse}\n\`\`\``,
            },
            finish_reason: "stop",
          },
        ],
      });

      const provider = new RHCustomProvider({
        apiKey: TEST_API_KEYS.RHCUSTOM,
        modelName: MODEL_NAMES.RHCUSTOM_DEEPSEEK,
        baseURL: API_ENDPOINTS.RHCUSTOM,
      });

      const result = await provider.generatePlaybook({
        prompt: "Configure Windows service",
        type: "playbook",
        createOutline: true,
      });

      // Windows paths should be properly escaped
      expect(result.content).toContain("C:\\\\Program Files");
      // Should be able to generate outline without YAML parsing errors
      expect(result.outline).toBeDefined();
    });
  });
});
