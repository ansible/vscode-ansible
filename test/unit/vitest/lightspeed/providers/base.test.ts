import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Module from "module";

// Create mock implementations
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

// Store original require as the import uses require()
const originalRequire = Module.prototype.require.bind(Module.prototype);

Module.prototype.require = function (
  this: Module,
  id: string,
): ReturnType<typeof originalRequire> {
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
};

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
    return output
      .trim()
      .replace(/^```ya?ml\s*/i, "")
      .replace(/```\s*$/, "");
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
  TEST_PROVIDER_INFO,
  TEST_PROMPTS,
  TEST_OPERATIONS,
  HTTP_STATUS_CODES,
  DEFAULT_TIMEOUTS,
  TEST_CONFIGS,
} from "../testConstants.js";

// This is needed because BaseLLMProvider is abstract and cannot be instantiated directly
class TestProvider extends BaseLLMProvider {
  readonly name = "test";
  readonly displayName = "Test Provider";

  // Minimal implementations of abstract methods - not tested here, only needed for instantiation
  async validateConfig(): Promise<boolean> {
    return true;
  }

  async getStatus(): Promise<ProviderStatus> {
    return { connected: true };
  }

  async completionRequest(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: CompletionRequestParams,
  ): Promise<CompletionResponseParams> {
    throw new Error("Not implemented in test provider");
  }

  async chatRequest(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: ChatRequestParams,
  ): Promise<ChatResponseParams> {
    throw new Error("Not implemented in test provider");
  }

  async generatePlaybook(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    throw new Error("Not implemented in test provider");
  }

  async generateRole(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: GenerationRequestParams,
  ): Promise<GenerationResponseParams> {
    throw new Error("Not implemented in test provider");
  }

  // Public test helper methods to access protected members and test base class functionality
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

  testHandleHttpError(
    error: { status?: number; message?: string },
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
      const error = {
        status: HTTP_STATUS_CODES.BAD_REQUEST,
        message: "Invalid request",
      };

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
      const error = {
        status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
        message: "Server error",
      };

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
      expect(result.message).toContain(
        String(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE),
      );
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
      expect(result.message).toContain(
        String(HTTP_STATUS_CODES.GATEWAY_TIMEOUT),
      );
    });

    it("should handle unknown status codes", () => {
      const provider = new TestProvider(TEST_CONFIGS.BASE_TEST);
      const error = {
        status: HTTP_STATUS_CODES.TEAPOT,
        message: "I'm a teapot",
      };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
        TEST_PROVIDER_INFO.PROVIDER_NAME,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(
        `${TEST_PROVIDER_INFO.PROVIDER_NAME} error`,
      );
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
      expect(result.message).toContain(
        `${TEST_PROVIDER_INFO.PROVIDER_NAME} error`,
      );
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
      const error = {
        status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
        message: "Error",
      };

      const result = provider.testHandleHttpError(
        error,
        TEST_OPERATIONS.GENERIC,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain(TEST_OPERATIONS.GENERIC);
    });
  });
});
