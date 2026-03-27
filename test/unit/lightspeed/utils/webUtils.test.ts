import { describe, it, expect, vi, beforeEach } from "vitest";
import { WCA_API_ENDPOINT_DEFAULT } from "@src/definitions/lightspeed";
import { SettingsManager } from "@src/settings";

// Mock the extension module
vi.mock("@src/extension", () => {
  return {
    lightSpeedManager: {
      llmProviderSettings: {
        getProvider: vi.fn(),
        get: vi.fn(),
      },
    },
  };
});

// Import after mocks are set up
import { getBaseUri } from "@src/features/lightspeed/utils/webUtils";
import { lightSpeedManager } from "@src/extension";

// Type for mocked lightSpeedManager to avoid 'any' usage
type MockedLightSpeedManager = {
  llmProviderSettings: {
    getProvider: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  } | null;
};

describe("webUtils - getBaseUri", () => {
  let mockSettingsManager: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal mock settings manager
    // Note: The extension handles migration to new schema via migrateFromSettingsJson()
    mockSettingsManager = {} as unknown as SettingsManager;

    // Reset llmProviderSettings mock with default WCA endpoint
    // In real usage, provider factory returns this default when not configured
    (
      lightSpeedManager as unknown as MockedLightSpeedManager
    ).llmProviderSettings = {
      getProvider: vi.fn().mockReturnValue("wca"),
      get: vi.fn().mockResolvedValue(WCA_API_ENDPOINT_DEFAULT),
    };
  });

  describe("WCA provider", () => {
    beforeEach(() => {
      vi.mocked(
        lightSpeedManager.llmProviderSettings.getProvider,
      ).mockReturnValue("wca");
    });

    it("should return default WCA endpoint when using provider factory default", async () => {
      // Simulate llmProviderSettings.get() returning the default from provider factory
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        WCA_API_ENDPOINT_DEFAULT,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should return custom endpoint for stage environment", async () => {
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        stageUrl,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(stageUrl);
    });

    it("should return custom endpoint for test environment", async () => {
      const testUrl = "https://test.ai.ansible.redhat.com";
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        testUrl,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(testUrl);
    });

    it("should return custom endpoint for on-premise installation", async () => {
      const onPremUrl = "https://lightspeed.company.internal";
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        onPremUrl,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(onPremUrl);
    });

    it("should remove trailing slash from custom WCA endpoint", async () => {
      const urlWithSlash = "https://stage.ai.ansible.redhat.com/";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        urlWithSlash,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle custom endpoint with whitespace", async () => {
      const urlWithSpace = "  https://stage.ai.ansible.redhat.com  ";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        urlWithSpace,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle custom endpoint with whitespace and trailing slash", async () => {
      const urlWithSpaceAndSlash = "  https://stage.ai.ansible.redhat.com/  ";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        urlWithSpaceAndSlash,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should use provider override parameter when provided", async () => {
      const customUrl = "https://override.example.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("google"),
        get: vi.fn().mockResolvedValue(customUrl),
      };

      const result = await getBaseUri(mockSettingsManager, "wca");

      // Should use WCA logic when override is "wca"
      expect(result).toBe(customUrl);
    });

    it("should use llmProviderSettings provider", async () => {
      const customUrl = "https://custom.example.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(customUrl),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });
  });

  describe("non-WCA providers", () => {
    it("should return custom endpoint for Google provider", async () => {
      const googleUrl = "https://google.ai.example.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("google"),
        get: vi.fn().mockResolvedValue(googleUrl),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(googleUrl);
    });

    it("should return custom endpoint for Red Hat AI provider", async () => {
      const redhatUrl = "https://ai.redhat.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("redhat"),
        get: vi.fn().mockResolvedValue(redhatUrl),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(redhatUrl);
    });

    it("should return custom endpoint for Ollama provider", async () => {
      const ollamaUrl = "http://localhost:11434";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("ollama"),
        get: vi.fn().mockResolvedValue(ollamaUrl),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(ollamaUrl);
    });

    it("should remove trailing slash for non-WCA providers", async () => {
      const urlWithSlash = "https://ai.redhat.com/";
      const expectedUrl = "https://ai.redhat.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("redhat"),
        get: vi.fn().mockResolvedValue(urlWithSlash),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle whitespace for non-WCA providers", async () => {
      const urlWithSpace = "  http://localhost:11434  ";
      const expectedUrl = "http://localhost:11434";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("ollama"),
        get: vi.fn().mockResolvedValue(urlWithSpace),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });
  });

  describe("edge cases", () => {
    it("should throw error when llmProviderSettings is null", async () => {
      // Simulate llmProviderSettings being null (indicates extension didn't initialize)
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = null;

      await expect(getBaseUri(mockSettingsManager)).rejects.toThrow(
        "LLM provider settings not initialized",
      );
    });

    it("should throw error when provider is not configured", async () => {
      // llmProviderSettings is initialized but getProvider returns null
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue(null),
        get: vi.fn().mockResolvedValue(""),
      };

      await expect(getBaseUri(mockSettingsManager)).rejects.toThrow(
        "Provider is not configured",
      );
    });

    it("should throw error when apiEndpoint is empty (provider factory misconfiguration)", async () => {
      // This should not happen in normal operation, but fail fast if it does
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        "",
      );

      await expect(getBaseUri(mockSettingsManager)).rejects.toThrow(
        'API endpoint not configured for provider "wca"',
      );
    });

    it("should throw error when apiEndpoint is whitespace only", async () => {
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        "   ",
      );

      await expect(getBaseUri(mockSettingsManager)).rejects.toThrow(
        'API endpoint not configured for provider "wca"',
      );
    });

    it("should handle URLs with multiple trailing slashes", async () => {
      const urlWithSlashes = "https://stage.ai.ansible.redhat.com///";
      // Current implementation only removes one trailing slash
      const expectedUrl = "https://stage.ai.ansible.redhat.com//";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(urlWithSlashes),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });
  });

  describe("regression tests for OAuth bug (AAP-69248)", () => {
    it("should NOT ignore custom stage URL for WCA provider", async () => {
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(stageUrl),
      };

      const result = await getBaseUri(mockSettingsManager);

      // This should return the stage URL, NOT the default production URL
      expect(result).toBe(stageUrl);
      expect(result).not.toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should NOT ignore custom on-premise URL for WCA provider", async () => {
      const onPremUrl = "https://lightspeed.internal.company.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(onPremUrl),
      };

      const result = await getBaseUri(mockSettingsManager);

      // This should return the on-prem URL, NOT the default production URL
      expect(result).toBe(onPremUrl);
      expect(result).not.toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should allow switching between production and stage for WCA", async () => {
      // First use production (provider factory returns default)
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(WCA_API_ENDPOINT_DEFAULT),
      };
      const productionResult = await getBaseUri(mockSettingsManager);
      expect(productionResult).toBe(WCA_API_ENDPOINT_DEFAULT);

      // Then switch to stage
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(stageUrl),
      };
      const stageResult = await getBaseUri(mockSettingsManager);
      expect(stageResult).toBe(stageUrl);

      // Then switch back to production (provider factory returns default)
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(WCA_API_ENDPOINT_DEFAULT),
      };
      const backToProductionResult = await getBaseUri(mockSettingsManager);
      expect(backToProductionResult).toBe(WCA_API_ENDPOINT_DEFAULT);
    });
  });

  describe("provider-specific settings (new feature)", () => {
    it("should use provider-specific apiEndpoint when available", async () => {
      const providerSpecificUrl = "https://provider-specific.example.com";

      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        providerSpecificUrl,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(providerSpecificUrl);
      expect(lightSpeedManager.llmProviderSettings.get).toHaveBeenCalledWith(
        "wca",
        "apiEndpoint",
      );
    });

    it("should propagate error when provider-specific get fails", async () => {
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockRejectedValue(
        new Error("Setting not found"),
      );

      await expect(getBaseUri(mockSettingsManager)).rejects.toThrow(
        "Setting not found",
      );
    });

    it("should use provider factory default for WCA when not explicitly configured", async () => {
      // Provider factory returns default when user hasn't set custom endpoint
      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        WCA_API_ENDPOINT_DEFAULT,
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(WCA_API_ENDPOINT_DEFAULT);
    });
  });
});
