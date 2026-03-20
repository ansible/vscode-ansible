import { describe, it, expect, vi, beforeEach } from "vitest";
import { WCA_API_ENDPOINT_DEFAULT } from "@src/definitions/lightspeed";
import { SettingsManager } from "@src/settings";

// Mock the extension module
vi.mock("@src/extension", () => {
  return {
    lightSpeedManager: {
      llmProviderSettings: {
        getProvider: vi.fn(),
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
  } | null;
};

describe("webUtils - getBaseUri", () => {
  let mockSettingsManager: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal mock settings manager
    mockSettingsManager = {
      settings: {
        lightSpeedService: {
          provider: "wca",
          apiEndpoint: WCA_API_ENDPOINT_DEFAULT,
        },
      },
    } as unknown as SettingsManager;

    // Reset llmProviderSettings mock (ensure it's not null first)
    (
      lightSpeedManager as unknown as MockedLightSpeedManager
    ).llmProviderSettings = {
      getProvider: vi.fn().mockReturnValue("wca"),
    };
  });

  describe("WCA provider", () => {
    beforeEach(() => {
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      vi.mocked(
        lightSpeedManager.llmProviderSettings.getProvider,
      ).mockReturnValue("wca");
    });

    it("should return default WCA endpoint when apiEndpoint is default", () => {
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        WCA_API_ENDPOINT_DEFAULT;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should return default WCA endpoint when apiEndpoint is empty", () => {
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = "";

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should return custom endpoint for stage environment", () => {
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = stageUrl;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(stageUrl);
    });

    it("should return custom endpoint for test environment", () => {
      const testUrl = "https://test.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = testUrl;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(testUrl);
    });

    it("should return custom endpoint for on-premise installation", () => {
      const onPremUrl = "https://lightspeed.company.internal";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = onPremUrl;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(onPremUrl);
    });

    it("should remove trailing slash from custom WCA endpoint", () => {
      const urlWithSlash = "https://stage.ai.ansible.redhat.com/";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSlash;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle custom endpoint with whitespace", () => {
      const urlWithSpace = "  https://stage.ai.ansible.redhat.com  ";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSpace;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle custom endpoint with whitespace and trailing slash", () => {
      const urlWithSpaceAndSlash = "  https://stage.ai.ansible.redhat.com/  ";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        urlWithSpaceAndSlash;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should use provider override parameter when provided", () => {
      const customUrl = "https://override.example.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;
      mockSettingsManager.settings.lightSpeedService.provider = "google";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("google"),
      };

      const result = getBaseUri(mockSettingsManager, "wca");

      // Should use WCA logic despite settings saying google
      expect(result).toBe(customUrl);
    });

    it("should prefer llmProviderSettings provider over settingsManager provider", () => {
      const customUrl = "https://custom.example.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;
      mockSettingsManager.settings.lightSpeedService.provider = "google";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });
  });

  describe("non-WCA providers", () => {
    it("should return custom endpoint for Google provider", () => {
      const googleUrl = "https://google.ai.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "google";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = googleUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("google"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(googleUrl);
    });

    it("should return custom endpoint for Red Hat AI provider", () => {
      const redhatUrl = "https://ai.redhat.com";
      mockSettingsManager.settings.lightSpeedService.provider = "redhat";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = redhatUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("redhat"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(redhatUrl);
    });

    it("should return custom endpoint for Ollama provider", () => {
      const ollamaUrl = "http://localhost:11434";
      mockSettingsManager.settings.lightSpeedService.provider = "ollama";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = ollamaUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("ollama"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(ollamaUrl);
    });

    it("should remove trailing slash for non-WCA providers", () => {
      const urlWithSlash = "https://ai.redhat.com/";
      const expectedUrl = "https://ai.redhat.com";
      mockSettingsManager.settings.lightSpeedService.provider = "redhat";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSlash;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("redhat"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle whitespace for non-WCA providers", () => {
      const urlWithSpace = "  http://localhost:11434  ";
      const expectedUrl = "http://localhost:11434";
      mockSettingsManager.settings.lightSpeedService.provider = "ollama";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSpace;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("ollama"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });
  });

  describe("edge cases", () => {
    it("should handle when llmProviderSettings is null", () => {
      const customUrl = "https://custom.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;

      // Simulate llmProviderSettings being null
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = null;

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });

    it("should use settingsManager provider when llmProviderSettings getProvider returns null", () => {
      const customUrl = "https://custom.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue(null),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });

    it("should handle URLs with multiple trailing slashes", () => {
      const urlWithSlashes = "https://stage.ai.ansible.redhat.com///";
      // Current implementation only removes one trailing slash
      const expectedUrl = "https://stage.ai.ansible.redhat.com//";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        urlWithSlashes;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
      };

      const result = getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });
  });

  describe("regression tests for OAuth bug (AAP-69248)", () => {
    it("should NOT ignore custom stage URL for WCA provider", () => {
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = stageUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
      };

      const result = getBaseUri(mockSettingsManager);

      // This should return the stage URL, NOT the default production URL
      expect(result).toBe(stageUrl);
      expect(result).not.toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should NOT ignore custom on-premise URL for WCA provider", () => {
      const onPremUrl = "https://lightspeed.internal.company.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = onPremUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
      };

      const result = getBaseUri(mockSettingsManager);

      // This should return the on-prem URL, NOT the default production URL
      expect(result).toBe(onPremUrl);
      expect(result).not.toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should allow switching between production and stage for WCA", () => {
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
      };

      // First use production
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        WCA_API_ENDPOINT_DEFAULT;
      const productionResult = getBaseUri(mockSettingsManager);
      expect(productionResult).toBe(WCA_API_ENDPOINT_DEFAULT);

      // Then switch to stage
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = stageUrl;
      const stageResult = getBaseUri(mockSettingsManager);
      expect(stageResult).toBe(stageUrl);

      // Then switch back to production
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        WCA_API_ENDPOINT_DEFAULT;
      const backToProductionResult = getBaseUri(mockSettingsManager);
      expect(backToProductionResult).toBe(WCA_API_ENDPOINT_DEFAULT);
    });
  });
});
