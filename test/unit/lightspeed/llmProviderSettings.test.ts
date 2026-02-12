import { describe, it, expect, vi, beforeEach } from "vitest";
import { LlmProviderSettings } from "../../../src/features/lightspeed/llmProviderSettings";
import type { ExtensionContext, SecretStorage, Memento } from "vscode";
import { PROVIDER_TYPES, TEST_API_KEYS } from "./testConstants";

vi.mock("../../../src/features/lightspeed/providers/factory", () => {
  const mockWcaProvider = {
    type: "wca",
    name: "wca",
    displayName: "IBM watsonx",
    defaultEndpoint: "https://c.ai.ansible.redhat.com",
    defaultModel: undefined,
    configSchema: [
      {
        key: "apiEndpoint",
        label: "Lightspeed URL",
        type: "string",
        required: true,
        placeholder: "https://c.ai.ansible.redhat.com",
      },
    ],
  };

  const mockGoogleProvider = {
    type: "google",
    name: "google",
    displayName: "Google Gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    configSchema: [
      {
        key: "apiEndpoint",
        label: "API Endpoint",
        type: "string",
        required: false,
        placeholder: "https://generativelanguage.googleapis.com/v1beta",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "AIza...",
      },
      {
        key: "modelName",
        label: "Model Name",
        type: "string",
        required: false,
        placeholder: "gemini-2.5-flash",
      },
    ],
  };

  return {
    providerFactory: {
      getSupportedProviders: vi.fn(() => [mockWcaProvider, mockGoogleProvider]),
    },
  };
});

describe("LlmProviderSettings", () => {
  let llmProviderSettings: LlmProviderSettings;
  let mockContext: ExtensionContext;
  let mockGlobalState: Memento;
  let mockSecrets: SecretStorage;
  let globalStateStore: Map<string, unknown>;
  let secretsStore: Map<string, string>;
  let mockGlobalStateGet: ReturnType<typeof vi.fn>;
  let mockGlobalStateUpdate: ReturnType<typeof vi.fn>;
  let mockGlobalStateKeys: ReturnType<typeof vi.fn>;
  let mockSecretsGet: ReturnType<typeof vi.fn>;
  let mockSecretsStore: ReturnType<typeof vi.fn>;
  let mockSecretsDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    globalStateStore = new Map();
    secretsStore = new Map();

    mockGlobalStateGet = vi.fn((key: string) => globalStateStore.get(key));
    mockGlobalStateUpdate = vi.fn((key: string, value: unknown) => {
      if (value === undefined) {
        globalStateStore.delete(key);
      } else {
        globalStateStore.set(key, value);
      }
      return Promise.resolve();
    });
    mockGlobalStateKeys = vi.fn(() => Array.from(globalStateStore.keys()));

    mockSecretsGet = vi.fn((key: string) =>
      Promise.resolve(secretsStore.get(key)),
    );
    mockSecretsStore = vi.fn((key: string, value: string) => {
      secretsStore.set(key, value);
      return Promise.resolve();
    });
    mockSecretsDelete = vi.fn((key: string) => {
      secretsStore.delete(key);
      return Promise.resolve();
    });

    mockGlobalState = {
      get: mockGlobalStateGet,
      update: mockGlobalStateUpdate,
      keys: mockGlobalStateKeys,
      setKeysForSync: vi.fn(),
    } as unknown as Memento;

    mockSecrets = {
      get: mockSecretsGet,
      store: mockSecretsStore,
      delete: mockSecretsDelete,
      onDidChange: vi.fn(),
    } as unknown as SecretStorage;

    mockContext = {
      globalState: mockGlobalState,
      secrets: mockSecrets,
    } as unknown as ExtensionContext;

    llmProviderSettings = new LlmProviderSettings(mockContext);
  });

  describe("getProvider / setProvider", () => {
    it("should return default provider (wca) when no provider is set", () => {
      const provider = llmProviderSettings.getProvider();
      expect(provider).toBe("wca");
    });

    it("should return the set provider", async () => {
      await llmProviderSettings.setProvider(PROVIDER_TYPES.GOOGLE);
      const provider = llmProviderSettings.getProvider();
      expect(provider).toBe(PROVIDER_TYPES.GOOGLE);
    });

    it("should persist provider to globalState", async () => {
      await llmProviderSettings.setProvider(PROVIDER_TYPES.GOOGLE);
      expect(mockGlobalStateUpdate).toHaveBeenCalledWith(
        "lightspeed.provider",
        PROVIDER_TYPES.GOOGLE,
      );
    });
  });

  describe("get / set for regular fields", () => {
    it("should return default endpoint for apiEndpoint field", async () => {
      const endpoint = await llmProviderSettings.get("google", "apiEndpoint");
      expect(endpoint).toBe("https://generativelanguage.googleapis.com/v1beta");
    });

    it("should return default model for modelName field", async () => {
      const model = await llmProviderSettings.get("google", "modelName");
      expect(model).toBe("gemini-2.5-flash");
    });

    it("should return stored value when set", async () => {
      await llmProviderSettings.set("google", "modelName", "gemini-pro");
      const model = await llmProviderSettings.get("google", "modelName");
      expect(model).toBe("gemini-pro");
    });

    it("should store regular fields in globalState", async () => {
      await llmProviderSettings.set("google", "modelName", "gemini-pro");
      expect(mockGlobalStateUpdate).toHaveBeenCalledWith(
        "lightspeed.setting.google.modelName",
        "gemini-pro",
      );
    });

    it("should return empty string for unknown fields", async () => {
      const value = await llmProviderSettings.get("google", "unknownField");
      expect(value).toBe("");
    });
  });

  describe("get / set for password fields (secrets)", () => {
    it("should store API key in secrets storage", async () => {
      await llmProviderSettings.set("google", "apiKey", TEST_API_KEYS.GOOGLE);
      expect(mockSecretsStore).toHaveBeenCalledWith(
        "lightspeed.secret.google.apiKey",
        TEST_API_KEYS.GOOGLE,
      );
    });

    it("should retrieve API key from secrets storage", async () => {
      secretsStore.set("lightspeed.secret.google.apiKey", TEST_API_KEYS.GOOGLE);
      const apiKey = await llmProviderSettings.get("google", "apiKey");
      expect(apiKey).toBe(TEST_API_KEYS.GOOGLE);
    });

    it("should return empty string when API key not set", async () => {
      const apiKey = await llmProviderSettings.get("google", "apiKey");
      expect(apiKey).toBe("");
    });

    it("should delete API key from secrets when set to empty", async () => {
      await llmProviderSettings.set("google", "apiKey", "");
      expect(mockSecretsDelete).toHaveBeenCalledWith(
        "lightspeed.secret.google.apiKey",
      );
    });
  });

  describe("connection status", () => {
    it("should return false when no connection status is set", () => {
      const status = llmProviderSettings.getConnectionStatus("google");
      expect(status).toBe(false);
    });

    it("should return true after setting connection status to true", async () => {
      await llmProviderSettings.setConnectionStatus(true, "google");
      const status = llmProviderSettings.getConnectionStatus("google");
      expect(status).toBe(true);
    });

    it("should use current provider when provider not specified", async () => {
      await llmProviderSettings.setProvider("google");
      await llmProviderSettings.setConnectionStatus(true);
      const status = llmProviderSettings.getConnectionStatus();
      expect(status).toBe(true);
    });

    it("should get all connection statuses", async () => {
      await llmProviderSettings.setConnectionStatus(true, "google");
      await llmProviderSettings.setConnectionStatus(false, "wca");

      const statuses = llmProviderSettings.getAllConnectionStatuses();
      expect(statuses).toEqual({
        wca: false,
        google: true,
      });
    });
  });

  describe("getAllSettings", () => {
    it("should return all settings for current provider", async () => {
      await llmProviderSettings.setProvider("google");
      secretsStore.set("lightspeed.secret.google.apiKey", TEST_API_KEYS.GOOGLE);
      await llmProviderSettings.setConnectionStatus(true, "google");

      const settings = await llmProviderSettings.getAllSettings();

      expect(settings.provider).toBe("google");
      expect(settings.apiKey).toBe(TEST_API_KEYS.GOOGLE);
      expect(settings.apiEndpoint).toBe(
        "https://generativelanguage.googleapis.com/v1beta",
      );
      expect(settings.modelName).toBe("gemini-2.5-flash");
      expect(settings.connectionStatuses.google).toBe(true);
    });
  });

  describe("clearAllSettings", () => {
    it("should clear provider setting", async () => {
      await llmProviderSettings.setProvider("google");
      await llmProviderSettings.clearAllSettings();

      expect(mockGlobalStateUpdate).toHaveBeenCalledWith(
        "lightspeed.provider",
        undefined,
      );
    });

    it("should clear secrets for password fields", async () => {
      await llmProviderSettings.set("google", "apiKey", TEST_API_KEYS.GOOGLE);
      await llmProviderSettings.clearAllSettings();

      expect(mockSecretsDelete).toHaveBeenCalledWith(
        "lightspeed.secret.google.apiKey",
      );
    });

    it("should clear connection statuses", async () => {
      await llmProviderSettings.setConnectionStatus(true, "google");
      await llmProviderSettings.clearAllSettings();

      expect(mockGlobalStateUpdate).toHaveBeenCalledWith(
        "lightspeed.connectionStatus.google",
        undefined,
      );
    });
  });

  describe("whitespace handling", () => {
    it("should trim whitespace from stored values on get", async () => {
      globalStateStore.set(
        "lightspeed.setting.google.modelName",
        "  gemini-pro  ",
      );
      const model = await llmProviderSettings.get("google", "modelName");
      expect(model).toBe("gemini-pro");
    });

    it("should trim whitespace when setting values", async () => {
      await llmProviderSettings.set("google", "modelName", "  gemini-pro  ");
      expect(mockGlobalStateUpdate).toHaveBeenCalledWith(
        "lightspeed.setting.google.modelName",
        "gemini-pro",
      );
    });

    it("should handle undefined value by storing empty string", async () => {
      await llmProviderSettings.set("google", "modelName", undefined);
      expect(mockGlobalStateUpdate).toHaveBeenCalledWith(
        "lightspeed.setting.google.modelName",
        "",
      );
    });
  });

  describe("edge cases", () => {
    it("should return empty string for unknown provider apiEndpoint", async () => {
      const endpoint = await llmProviderSettings.get(
        "unknown-provider",
        "apiEndpoint",
      );
      expect(endpoint).toBe("");
    });

    it("should return empty string for unknown provider modelName", async () => {
      const model = await llmProviderSettings.get(
        "unknown-provider",
        "modelName",
      );
      expect(model).toBe("");
    });

    it("should return stored empty string instead of default", async () => {
      await llmProviderSettings.set("google", "apiEndpoint", "");
      const endpoint = await llmProviderSettings.get("google", "apiEndpoint");
      expect(endpoint).toBe("");
    });
  });

  describe("getAllSettings edge cases", () => {
    it("should return undefined modelName when empty string", async () => {
      await llmProviderSettings.setProvider("wca");
      const settings = await llmProviderSettings.getAllSettings();
      expect(settings.modelName).toBeUndefined();
    });
  });
});
