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
      get: vi.fn().mockResolvedValue(""),
    };
  });

  describe("WCA provider", () => {
    beforeEach(() => {
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      vi.mocked(
        lightSpeedManager.llmProviderSettings.getProvider,
      ).mockReturnValue("wca");
    });

    it("should return default WCA endpoint when apiEndpoint is default", async () => {
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        WCA_API_ENDPOINT_DEFAULT;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should return default WCA endpoint when apiEndpoint is empty", async () => {
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = "";

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should return custom endpoint for stage environment", async () => {
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = stageUrl;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(stageUrl);
    });

    it("should return custom endpoint for test environment", async () => {
      const testUrl = "https://test.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = testUrl;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(testUrl);
    });

    it("should return custom endpoint for on-premise installation", async () => {
      const onPremUrl = "https://lightspeed.company.internal";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = onPremUrl;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(onPremUrl);
    });

    it("should remove trailing slash from custom WCA endpoint", async () => {
      const urlWithSlash = "https://stage.ai.ansible.redhat.com/";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSlash;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle custom endpoint with whitespace", async () => {
      const urlWithSpace = "  https://stage.ai.ansible.redhat.com  ";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSpace;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle custom endpoint with whitespace and trailing slash", async () => {
      const urlWithSpaceAndSlash = "  https://stage.ai.ansible.redhat.com/  ";
      const expectedUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        urlWithSpaceAndSlash;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should use provider override parameter when provided", async () => {
      const customUrl = "https://override.example.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;
      mockSettingsManager.settings.lightSpeedService.provider = "google";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("google"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager, "wca");

      // Should use WCA logic despite settings saying google
      expect(result).toBe(customUrl);
    });

    it("should prefer llmProviderSettings provider over settingsManager provider", async () => {
      const customUrl = "https://custom.example.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;
      mockSettingsManager.settings.lightSpeedService.provider = "google";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });
  });

  describe("non-WCA providers", () => {
    it("should return custom endpoint for Google provider", async () => {
      const googleUrl = "https://google.ai.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "google";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = googleUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("google"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(googleUrl);
    });

    it("should return custom endpoint for Red Hat AI provider", async () => {
      const redhatUrl = "https://ai.redhat.com";
      mockSettingsManager.settings.lightSpeedService.provider = "redhat";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = redhatUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("redhat"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(redhatUrl);
    });

    it("should return custom endpoint for Ollama provider", async () => {
      const ollamaUrl = "http://localhost:11434";
      mockSettingsManager.settings.lightSpeedService.provider = "ollama";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = ollamaUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("ollama"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(ollamaUrl);
    });

    it("should remove trailing slash for non-WCA providers", async () => {
      const urlWithSlash = "https://ai.redhat.com/";
      const expectedUrl = "https://ai.redhat.com";
      mockSettingsManager.settings.lightSpeedService.provider = "redhat";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSlash;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("redhat"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });

    it("should handle whitespace for non-WCA providers", async () => {
      const urlWithSpace = "  http://localhost:11434  ";
      const expectedUrl = "http://localhost:11434";
      mockSettingsManager.settings.lightSpeedService.provider = "ollama";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = urlWithSpace;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("ollama"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });
  });

  describe("edge cases", () => {
    it("should handle when llmProviderSettings is null", async () => {
      const customUrl = "https://custom.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;

      // Simulate llmProviderSettings being null
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = null;

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });

    it("should use settingsManager provider when llmProviderSettings getProvider returns null", async () => {
      const customUrl = "https://custom.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = customUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue(null),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(customUrl);
    });

    it("should handle URLs with multiple trailing slashes", async () => {
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
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(expectedUrl);
    });
  });

  describe("regression tests for OAuth bug (AAP-69248)", () => {
    it("should NOT ignore custom stage URL for WCA provider", async () => {
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = stageUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      // This should return the stage URL, NOT the default production URL
      expect(result).toBe(stageUrl);
      expect(result).not.toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should NOT ignore custom on-premise URL for WCA provider", async () => {
      const onPremUrl = "https://lightspeed.internal.company.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = onPremUrl;
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(""),
      };

      const result = await getBaseUri(mockSettingsManager);

      // This should return the on-prem URL, NOT the default production URL
      expect(result).toBe(onPremUrl);
      expect(result).not.toBe(WCA_API_ENDPOINT_DEFAULT);
    });

    it("should allow switching between production and stage for WCA", async () => {
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      (
        lightSpeedManager as unknown as MockedLightSpeedManager
      ).llmProviderSettings = {
        getProvider: vi.fn().mockReturnValue("wca"),
        get: vi.fn().mockResolvedValue(""),
      };

      // First use production
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        WCA_API_ENDPOINT_DEFAULT;
      const productionResult = await getBaseUri(mockSettingsManager);
      expect(productionResult).toBe(WCA_API_ENDPOINT_DEFAULT);

      // Then switch to stage
      const stageUrl = "https://stage.ai.ansible.redhat.com";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = stageUrl;
      const stageResult = await getBaseUri(mockSettingsManager);
      expect(stageResult).toBe(stageUrl);

      // Then switch back to production
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        WCA_API_ENDPOINT_DEFAULT;
      const backToProductionResult = await getBaseUri(mockSettingsManager);
      expect(backToProductionResult).toBe(WCA_API_ENDPOINT_DEFAULT);
    });
  });

  describe("provider-specific settings (new feature)", () => {
    it("should use provider-specific apiEndpoint when available", async () => {
      const providerSpecificUrl = "https://provider-specific.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint =
        "https://legacy.example.com";

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

    it("should fall back to legacy settings when provider-specific get fails", async () => {
      const legacyUrl = "https://legacy.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = legacyUrl;

      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockRejectedValue(
        new Error("Setting not found"),
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(legacyUrl);
    });

    it("should fall back to legacy settings when provider-specific returns empty string", async () => {
      const legacyUrl = "https://legacy.example.com";
      mockSettingsManager.settings.lightSpeedService.provider = "wca";
      mockSettingsManager.settings.lightSpeedService.apiEndpoint = legacyUrl;

      vi.mocked(lightSpeedManager.llmProviderSettings.get).mockResolvedValue(
        "",
      );

      const result = await getBaseUri(mockSettingsManager);

      expect(result).toBe(legacyUrl);
    });
  });
});
