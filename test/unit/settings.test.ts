import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { SettingsManager } from "@src/settings";
import type { LlmProviderSettings } from "@src/features/lightspeed/llmProviderSettings";

describe("SettingsManager", () => {
  let settingsManager: SettingsManager;

  beforeEach(() => {
    settingsManager = new SettingsManager();

    const mockConfig = {
      get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      mockConfig as unknown as vscode.WorkspaceConfiguration,
    );
  });

  describe("setLlmProviderSettings", () => {
    it("should store the LlmProviderSettings instance", async () => {
      const mockGetAllSettings = vi.fn().mockResolvedValue({
        provider: "google",
        apiEndpoint: "https://api.google.com",
        modelName: "gemini-pro",
        apiKey: "test-key",
      });

      const mockLlmProviderSettings = {
        getAllSettings: mockGetAllSettings,
      } as unknown as LlmProviderSettings;

      settingsManager.setLlmProviderSettings(mockLlmProviderSettings);

      await settingsManager.initialize();

      expect(mockGetAllSettings).toHaveBeenCalled();

      expect(settingsManager.settings.lightSpeedService.provider).toBe(
        "google",
      );
      expect(settingsManager.settings.lightSpeedService.apiEndpoint).toBe(
        "https://api.google.com",
      );
      expect(settingsManager.settings.lightSpeedService.modelName).toBe(
        "gemini-pro",
      );
    });

    it("should use default settings when llmProviderSettings is not set", async () => {
      await settingsManager.initialize();

      expect(settingsManager.settings.lightSpeedService.provider).toBe("wca");
      expect(settingsManager.settings.lightSpeedService.apiEndpoint).toBe(
        "https://c.ai.ansible.redhat.com",
      );
      expect(settingsManager.settings.lightSpeedService.apiKey).toBe("");
    });
  });
});
