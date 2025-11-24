import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LLMProviderFactory,
  ProviderType,
} from "../../../../../src/features/lightspeed/providers/factory.js";
import { PROVIDER_TYPES, TEST_LIGHTSPEED_SETTINGS } from "../testConstants.js";

// Mock AnsibleContextProcessor for providers that extend BaseLLMProvider
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

// Use vi.mock for ES modules - these are hoisted
vi.mock("../../../../../src/features/lightspeed/ansibleContext", () => ({
  AnsibleContextProcessor: {
    enhancePromptForAnsible: mockEnhancePromptForAnsible,
    cleanAnsibleOutput: mockCleanAnsibleOutput,
  },
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
});

describe("LLMProviderFactory", () => {
  describe("Singleton pattern", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = LLMProviderFactory.getInstance();
      const instance2 = LLMProviderFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return an instance of LLMProviderFactory", () => {
      const instance = LLMProviderFactory.getInstance();
      expect(instance).toBeInstanceOf(LLMProviderFactory);
    });
  });

  describe("createProvider", () => {
    describe("Google provider", () => {
      it("should create Google provider with full config", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.GOOGLE_FULL;

        const provider = factory.createProvider(PROVIDER_TYPES.GOOGLE, config);

        expect(provider).toBeDefined();
        expect(provider.name).toBe("google");
      });

      it("should throw error when API key is missing", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.GOOGLE_WITH_EMPTY_API_KEY;

        expect(() => {
          factory.createProvider(PROVIDER_TYPES.GOOGLE, config);
        }).toThrow("API Key is required for Google Gemini");
      });
    });

    describe("WCA provider", () => {
      it("should throw error when trying to create WCA provider", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.WCA;

        expect(() => {
          factory.createProvider(PROVIDER_TYPES.WCA, config);
        }).toThrow("WCA provider should be handled by existing LightSpeedAPI");
      });
    });

    describe("Unsupported provider", () => {
      it("should throw error for unsupported provider type", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.UNSUPPORTED;

        expect(() => {
          factory.createProvider("unsupported" as ProviderType, config);
        }).toThrow("Unsupported provider type: unsupported");
      });
    });
  });

  describe("getSupportedProviders", () => {
    it("should return array of supported providers", () => {
      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);
    });

    it("should include WCA provider", () => {
      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();
      const wcaProvider = providers.find((p) => p.type === PROVIDER_TYPES.WCA);

      expect(wcaProvider).toBeDefined();
      expect(wcaProvider?.type).toBe(PROVIDER_TYPES.WCA);
      expect(wcaProvider?.name).toBe("wca");
      expect(wcaProvider?.displayName).toContain("Red Hat Ansible Lightspeed");
    });

    it("should include Google provider", () => {
      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();
      const googleProvider = providers.find(
        (p) => p.type === PROVIDER_TYPES.GOOGLE,
      );

      expect(googleProvider).toBeDefined();
      expect(googleProvider?.type).toBe(PROVIDER_TYPES.GOOGLE);
      expect(googleProvider?.name).toBe("google");
      expect(googleProvider?.displayName).toBe("Google Gemini");
    });

    it("should have correct structure for each provider", () => {
      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();

      providers.forEach((provider) => {
        expect(provider).toHaveProperty("type");
        expect(provider).toHaveProperty("name");
        expect(provider).toHaveProperty("displayName");
        expect(provider).toHaveProperty("description");
        expect(provider).toHaveProperty("configSchema");
        expect(Array.isArray(provider.configSchema)).toBe(true);
      });
    });

    it("should have config schema with required fields", () => {
      const factory = LLMProviderFactory.getInstance();
      const providers = factory.getSupportedProviders();

      providers.forEach((provider) => {
        provider.configSchema.forEach((field) => {
          expect(field).toHaveProperty("key");
          expect(field).toHaveProperty("label");
          expect(field).toHaveProperty("type");
          expect(field).toHaveProperty("required");
          expect(typeof field.required).toBe("boolean");
        });
      });
    });
  });

  describe("validateProviderConfig", () => {
    describe("Google provider validation", () => {
      it("should return true for valid Google config", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.GOOGLE_MINIMAL;

        const isValid = factory.validateProviderConfig(
          PROVIDER_TYPES.GOOGLE,
          config,
        );

        expect(isValid).toBe(true);
      });

      it("should return false when API key is missing", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.GOOGLE_WITH_EMPTY_API_KEY;

        const isValid = factory.validateProviderConfig(
          PROVIDER_TYPES.GOOGLE,
          config,
        );

        expect(isValid).toBe(false);
      });
    });

    describe("WCA provider validation", () => {
      it("should return true for valid WCA config", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.WCA;

        const isValid = factory.validateProviderConfig(
          PROVIDER_TYPES.WCA,
          config,
        );

        expect(isValid).toBe(true);
      });
    });

    describe("Unsupported provider validation", () => {
      it("should return false for unsupported provider type", () => {
        const factory = LLMProviderFactory.getInstance();
        const config = TEST_LIGHTSPEED_SETTINGS.UNSUPPORTED;

        const isValid = factory.validateProviderConfig(
          "unsupported" as ProviderType,
          config,
        );

        expect(isValid).toBe(false);
      });
    });
  });
});
