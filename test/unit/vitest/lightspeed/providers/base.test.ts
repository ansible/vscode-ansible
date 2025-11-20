import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Module from "module";

// Create mock implementations
const mockEnhancePromptForAnsible = vi.fn((prompt: string, context?: string) => {
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

// Store original require as the import uses require()
const originalRequire = Module.prototype.require;

// Workaround to patch require() immediately to intercept "../ansibleContext" calls and this must happen before base.js is imported
Module.prototype.require = function (this: any, id: string) {
  // Intercept the require call for "../ansibleContext"
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
  // For all other requires, use the original
  return originalRequire.call(this, id);
} as any;

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Reset the mock implementations
  mockEnhancePromptForAnsible.mockImplementation(
    (prompt: string, context?: string) => {
      return `enhanced: ${prompt} with context: ${context || "none"}`;
    },
  );
  mockCleanAnsibleOutput.mockImplementation((output: string) => {
    return output.trim().replace(/^```ya?ml\s*/i, "").replace(/```\s*$/, "");
  });
});

import {
  BaseLLMProvider,
  ProviderStatus,
  ChatRequestParams,
  ChatResponseParams,
  GenerationRequestParams,
  GenerationResponseParams,
} from "../../../../../src/features/lightspeed/providers/base.js";
import {
  CompletionRequestParams,
  CompletionResponseParams,
} from "../../../../../src/interfaces/lightspeed.js";
import {
  TEST_API_KEYS,
  TEST_PROVIDER_INFO,
  MODEL_NAMES,
  TEST_RESPONSES,
  TEST_PROMPTS,
  TEST_CONTENT,
  TEST_OPERATIONS,
  HTTP_STATUS_CODES,
  DEFAULT_TIMEOUTS,
  TEST_CONFIGS,
} from "../testConstants.js";

// Create a concrete implementation of BaseLLMProvider for testing
class TestProvider extends BaseLLMProvider {
  readonly name = TEST_PROVIDER_INFO.NAME;
  readonly displayName = TEST_PROVIDER_INFO.DISPLAY_NAME;

  async validateConfig(): Promise<boolean> {
    return this.config?.apiKey !== undefined;
  }

  async getStatus(): Promise<ProviderStatus> {
    const isValid = await this.validateConfig();
    return {
      connected: isValid,
      error: isValid ? undefined : "Invalid configuration",
      modelInfo: isValid
        ? {
            name: MODEL_NAMES.TEST_MODEL,
            version: "1.0",
            capabilities: ["completion", "chat"],
          }
        : undefined,
    };
  }

  async completionRequest(
    params: CompletionRequestParams,
  ): Promise<CompletionResponseParams> {
    return {
      predictions: [TEST_RESPONSES.COMPLETION],
      suggestionId: params.suggestionId || TEST_RESPONSES.SUGGESTION_ID,
    };
  }

  async chatRequest(params: ChatRequestParams): Promise<ChatResponseParams> {
    return {
      message: TEST_RESPONSES.MESSAGE,
      conversationId: params.conversationId || TEST_RESPONSES.CONVERSATION_ID_DEFAULT,
      model: MODEL_NAMES.TEST_MODEL,
    };
  }

  async generatePlaybook(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    return {
      content: TEST_CONTENT.PLAYBOOK,
      outline: params.outline || TEST_CONTENT.OUTLINE_DEFAULT,
      model: MODEL_NAMES.TEST_MODEL,
    };
  }

  async generateRole(
    params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    return {
      content: TEST_CONTENT.ROLE,
      outline: params.outline || TEST_CONTENT.OUTLINE_DEFAULT,
      model: MODEL_NAMES.TEST_MODEL,
    };
  }

  // Public test helper methods to access protected members
  getConfig() {
    return this.config;
  }

  getTimeout() {
    return this.timeout;
  }

  testApplyAnsibleContext(
    prompt: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>,
  ): string {
    return this.applyAnsibleContext(prompt, metadata);
  }

  testCleanAnsibleOutput(output: string): string {
    return this.cleanAnsibleOutput(output);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testHandleHttpError(
    error: any,
    operation: string,
    providerName?: string,
  ): Error {
    return this.handleHttpError(error, operation, providerName);
  }
}

describe("BaseLLMProvider", () => {
  describe("Constructor", () => {
    it("should initialize with config and default timeout", () => {
      const config = TEST_CONFIGS.BASE_TEST;
      const provider = new TestProvider(config);

      expect(provider.getConfig()).toEqual(config);
      expect(provider.getTimeout()).toBe(DEFAULT_TIMEOUTS.DEFAULT);
    });

    it("should initialize with custom timeout", () => {
      const config = TEST_CONFIGS.BASE_TEST;
      const provider = new TestProvider(config, DEFAULT_TIMEOUTS.CUSTOM);

      expect(provider.getTimeout()).toBe(DEFAULT_TIMEOUTS.CUSTOM);
    });
  });

  describe("applyAnsibleContext", () => {
    it("should enhance prompt with Ansible context", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const prompt = TEST_PROMPTS.INSTALL_NGINX;
      const metadata = {
        ansibleFileType: "playbook",
        context: "existing context",
      };

      const result = provider.testApplyAnsibleContext(prompt, metadata);

      expect(result).toContain("enhanced:");
      expect(result).toContain(prompt);
    });

    it("should handle prompt without metadata", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const prompt = TEST_PROMPTS.INSTALL_NGINX;

      const result = provider.testApplyAnsibleContext(prompt);

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should handle metadata with documentUri and workspaceContext", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const prompt = TEST_PROMPTS.CREATE_TASK;
      const metadata = {
        ansibleFileType: "role",
        documentUri: "file:///test.yml",
        workspaceContext: "workspace info",
        context: "additional context",
      };

      const result = provider.testApplyAnsibleContext(prompt, metadata);

      expect(result).toBeDefined();
      expect(result).toContain(prompt);
    });

    it("should default fileType to playbook when not provided", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const prompt = TEST_PROMPTS.GENERIC;
      const metadata = {};

      const result = provider.testApplyAnsibleContext(prompt, metadata);

      expect(result).toBeDefined();
    });
  });

  describe("cleanAnsibleOutput", () => {
    it("should clean YAML code blocks from output", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const output = "```yaml\n---\n- name: test\n```";

      const result = provider.testCleanAnsibleOutput(output);

      expect(result).not.toContain("```yaml");
      expect(result).not.toContain("```");
    });

    it("should clean YML code blocks from output", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const output = "```yml\n---\n- name: test\n```";

      const result = provider.testCleanAnsibleOutput(output);

      expect(result).not.toContain("```yml");
    });

    it("should trim whitespace from output", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const output = "   \n---\n- name: test\n   ";

      const result = provider.testCleanAnsibleOutput(output);

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should handle empty output", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const output = "";

      const result = provider.testCleanAnsibleOutput(output);

      expect(result).toBe("");
    });
  });

  describe("handleHttpError", () => {
    it("should handle 400 Bad Request", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.BAD_REQUEST, message: "Invalid request" };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("Bad request");
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
    });

    it("should handle 403 Forbidden", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.FORBIDDEN };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("Forbidden");
      expect(result.message).toContain("API key");
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
      expect(result.message).toContain(String(HTTP_STATUS_CODES.FORBIDDEN));
    });

    it("should handle 429 Rate Limit", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.RATE_LIMIT };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("Rate limit exceeded");
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
      expect(result.message).toContain(String(HTTP_STATUS_CODES.RATE_LIMIT));
    });

    it("should handle 500 Internal Server Error", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR, message: "Server error" };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(TEST_PROVIDER_INFO.PROVIDER_NAME);
      expect(result.message).toContain("unexpected error");
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
    });

    it("should handle 503 Service Unavailable", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.SERVICE_UNAVAILABLE };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("Service unavailable");
      expect(result.message).toContain(TEST_PROVIDER_INFO.PROVIDER_NAME);
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
      expect(result.message).toContain(String(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE));
    });

    it("should handle 504 Gateway Timeout", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.GATEWAY_TIMEOUT };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("Gateway timeout");
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
      expect(result.message).toContain(String(HTTP_STATUS_CODES.GATEWAY_TIMEOUT));
    });

    it("should handle unknown status codes", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.TEAPOT, message: "I'm a teapot" };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(`${TEST_PROVIDER_INFO.PROVIDER_NAME} error`);
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
      expect(result.message).toContain(String(HTTP_STATUS_CODES.TEAPOT));
    });

    it("should handle errors without status code", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { message: "Network error" };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(`${TEST_PROVIDER_INFO.PROVIDER_NAME} error`);
      expect(result.message).toContain("Network error");
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
      expect(result.message).toContain("N/A");
    });

    it("should handle errors without message", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(TEST_PROVIDER_INFO.PROVIDER_NAME);
      expect(result.message).toContain("unexpected error");
      expect(result.message).toContain("Unknown error");
    });

    it("should use default provider name when not provided", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = { status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR, message: "Error" };

      const result = provider.testHandleHttpError(error, TEST_OPERATIONS.GENERIC);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
    });
  });

  describe("Abstract methods implementation", () => {
    it("should have name property", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      expect(provider.name).toBe(TEST_PROVIDER_INFO.NAME);
    });

    it("should have displayName property", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      expect(provider.displayName).toBe(TEST_PROVIDER_INFO.DISPLAY_NAME);
    });

    it("should validate config correctly", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const result = await provider.validateConfig();
      expect(result).toBe(true);
    });

    it("should return false for invalid config", async () => {
      const provider = new TestProvider({});
      const result = await provider.validateConfig();
      expect(result).toBe(false);
    });

    it("should get status with valid config", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const status = await provider.getStatus();

      expect(status.connected).toBe(true);
      expect(status.modelInfo).toBeDefined();
      expect(status.modelInfo?.name).toBe(MODEL_NAMES.TEST_MODEL);
    });

    it("should get status with invalid config", async () => {
      const provider = new TestProvider({});
      const status = await provider.getStatus();

      expect(status.connected).toBe(false);
      expect(status.error).toBeDefined();
    });

    it("should handle completion request", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: CompletionRequestParams = {
        prompt: TEST_PROMPTS.TEST_PROMPT,
        suggestionId: TEST_RESPONSES.SUGGESTION_ID,
      };

      const result = await provider.completionRequest(params);

      expect(result).toBeDefined();
      expect(result.predictions).toContain(TEST_RESPONSES.COMPLETION);
      expect(result.suggestionId).toBe(TEST_RESPONSES.SUGGESTION_ID);
    });

    it("should handle chat request", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: ChatRequestParams = {
        message: "Hello",
        conversationId: "conv-123",
      };

      const result = await provider.chatRequest(params);

      expect(result.message).toBe(TEST_RESPONSES.MESSAGE);
      expect(result.conversationId).toBe("conv-123");
      expect(result.model).toBe(MODEL_NAMES.TEST_MODEL);
    });

    it("should handle chat request without conversationId", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: ChatRequestParams = {
        message: "Hello",
      };

      const result = await provider.chatRequest(params);

      expect(result.conversationId).toBe(TEST_RESPONSES.CONVERSATION_ID_DEFAULT);
    });

    it("should handle playbook generation", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
      };

      const result = await provider.generatePlaybook(params);

      expect(result.content).toContain("playbook");
      expect(result.outline).toBe(TEST_CONTENT.OUTLINE_DEFAULT);
      expect(result.model).toBe(MODEL_NAMES.TEST_MODEL);
    });

    it("should handle playbook generation with outline", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.INSTALL_NGINX,
        type: "playbook",
        outline: "1. Step one\n2. Step two",
      };

      const result = await provider.generatePlaybook(params);

      expect(result.outline).toBe("1. Step one\n2. Step two");
    });

    it("should handle role generation", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
      };

      const result = await provider.generateRole(params);

      expect(result.content).toContain("role");
      expect(result.outline).toBe(TEST_CONTENT.OUTLINE_DEFAULT);
      expect(result.model).toBe(MODEL_NAMES.TEST_MODEL);
    });

    it("should handle role generation with outline", async () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const params: GenerationRequestParams = {
        prompt: TEST_PROMPTS.CREATE_ROLE,
        type: "role",
        outline: "1. Setup\n2. Configure",
      };

      const result = await provider.generateRole(params);

      expect(result.outline).toBe("1. Setup\n2. Configure");
    });
  });
});

