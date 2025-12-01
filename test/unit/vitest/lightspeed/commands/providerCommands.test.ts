import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ProviderCommands } from "../../../../../src/features/lightspeed/commands/providerCommands";
import type { LightSpeedManager } from "../../../../../src/features/lightspeed/base";
import type { ProviderManager } from "../../../../../src/features/lightspeed/providerManager";
import { ProviderStatus } from "../../../../../src/features/lightspeed/providers/base";
import {
  PROVIDER_TYPES,
  TEST_API_KEYS,
  MODEL_NAMES,
  GOOGLE_PROVIDER,
} from "../testConstants";

// Mock vscode module
vi.mock("vscode", () => {
  const mockCommands = {
    registerCommand: vi.fn(),
  };

  const mockWindow = {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    withProgress: vi.fn(),
    showTextDocument: vi.fn(),
  };

  const mockWorkspace = {
    getConfiguration: vi.fn(),
    openTextDocument: vi.fn(),
  };

  const mockConfiguration = {
    get: vi.fn(),
    update: vi.fn(),
  };

  return {
    commands: mockCommands,
    window: mockWindow,
    workspace: mockWorkspace,
    ConfigurationTarget: {
      Workspace: 1,
      Global: 2,
      WorkspaceFolder: 3,
    },
    ProgressLocation: {
      Notification: 15,
    },
    __mockCommands: mockCommands,
    __mockWindow: mockWindow,
    __mockWorkspace: mockWorkspace,
    __mockConfiguration: mockConfiguration,
  };
});

// Mock providerFactory - must use hardcoded values, not imports (hoisted)
vi.mock("../../../../../src/features/lightspeed/providers/factory", () => {
  const mockProviderInfo = {
    type: "google",
    name: "google",
    displayName: "Google Gemini",
    description: "Direct access to Google Gemini models",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    configSchema: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "AIza...",
        description: "Your Google AI API key",
      },
      {
        key: "modelName",
        label: "Model Name",
        type: "string",
        required: false,
        placeholder: "gemini-2.5-flash",
        description:
          "The Gemini model to use (optional, defaults to gemini-2.5-flash)",
      },
    ],
  };

  return {
    providerFactory: {
      getSupportedProviders: vi.fn(() => [mockProviderInfo]),
    },
  };
});

// Import after mocks
import { providerFactory } from "../../../../../src/features/lightspeed/providers/factory";

describe("ProviderCommands", () => {
  let providerCommands: ProviderCommands;
  let mockContext: vscode.ExtensionContext;
  let mockLightSpeedManager: LightSpeedManager;
  let mockProviderManager: ProviderManager;
  let mockSubscriptions: vscode.Disposable[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock subscriptions
    mockSubscriptions = [];
    mockContext = {
      subscriptions: mockSubscriptions,
    } as unknown as vscode.ExtensionContext;

    // Setup mock provider manager
    mockProviderManager = {
      getActiveProvider: vi.fn(),
      getProviderStatus: vi.fn(),
      getAvailableProviders: vi.fn(),
      testProviderConnection: vi.fn(),
      refreshProviders: vi.fn(),
    } as unknown as ProviderManager;

    // Setup mock light speed manager
    mockLightSpeedManager = {
      providerManager: mockProviderManager,
    } as unknown as LightSpeedManager;

    // Setup mock workspace configuration
    const mockConfig = {
      get: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      mockConfig as any,
    );

    providerCommands = new ProviderCommands(
      mockContext,
      mockLightSpeedManager,
    );
  });

  describe("registerCommands", () => {
    it("should register all provider-related commands", () => {
      providerCommands.registerCommands();

      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(4);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.testProviderConnection",
        expect.any(Function),
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.configureLlmProvider",
        expect.any(Function),
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.showProviderStatus",
        expect.any(Function),
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "ansible.lightspeed.switchProvider",
        expect.any(Function),
      );

      // Verify subscriptions are added
      expect(mockContext.subscriptions.length).toBe(4);
    });
  });

  describe("testProviderConnection", () => {
    it("should show warning when no provider is active", async () => {
      vi.mocked(mockProviderManager.getActiveProvider).mockReturnValue(null);

      // Access private method via type assertion
      await (providerCommands as any).testProviderConnection();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No provider is currently active. Please configure a provider first.",
      );
      expect(mockProviderManager.testProviderConnection).not.toHaveBeenCalled();
    });

    it("should test Google provider connection successfully", async () => {
      const mockStatus: ProviderStatus = {
        connected: true,
        modelInfo: {
          name: MODEL_NAMES.GEMINI_PRO,
          capabilities: ["completion", "chat", "generation"],
        },
      };

      vi.mocked(mockProviderManager.getActiveProvider).mockReturnValue(
        "llmprovider",
      );
      vi.mocked(mockProviderManager.testProviderConnection).mockResolvedValue(
        mockStatus,
      );

      // Mock withProgress to execute the callback immediately
      vi.mocked(vscode.window.withProgress).mockImplementation(
        async (options, task) => {
          const mockProgress = { report: vi.fn() };
          const mockToken = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
          return await task(mockProgress as any, mockToken as any);
        },
      );

      await (providerCommands as any).testProviderConnection();

      expect(mockProviderManager.testProviderConnection).toHaveBeenCalledWith(
        "llmprovider",
      );
      expect(vscode.window.withProgress).toHaveBeenCalledWith(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Testing llmprovider provider connection...",
          cancellable: false,
        },
        expect.any(Function),
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "✅ LLMPROVIDER provider connected successfully!",
        {
          detail: `Model: ${MODEL_NAMES.GEMINI_PRO}`,
        },
      );
    });

    it("should show error when Google provider connection fails", async () => {
      const mockStatus: ProviderStatus = {
        connected: false,
        error: "Invalid API key",
      };

      vi.mocked(mockProviderManager.getActiveProvider).mockReturnValue(
        "llmprovider",
      );
      vi.mocked(mockProviderManager.testProviderConnection).mockResolvedValue(
        mockStatus,
      );

      vi.mocked(vscode.window.withProgress).mockImplementation(
        async (options, task) => {
          const mockProgress = { report: vi.fn() };
          const mockToken = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
          return await task(mockProgress as any, mockToken as any);
        },
      );

      await (providerCommands as any).testProviderConnection();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "❌ LLMPROVIDER provider connection failed: Invalid API key",
      );
    });
  });

  describe("configureLlmProvider", () => {
    it("should configure Google provider successfully", async () => {
      const mockProviderInfo = {
        label: GOOGLE_PROVIDER.DISPLAY_NAME,
        description: "Direct access to Google Gemini models",
        detail: PROVIDER_TYPES.GOOGLE,
        provider: {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          configSchema: [
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
          defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
        },
      };

      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === "apiKey") return "";
          return undefined;
        }),
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockProviderInfo as any,
      );
      vi.mocked(vscode.window.showInputBox)
        .mockResolvedValueOnce(TEST_API_KEYS.GOOGLE) // API key
        .mockResolvedValueOnce(undefined); // Model name (optional, cancelled)
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        undefined,
      );

      await (providerCommands as any).configureLlmProvider();

      expect(providerFactory.getSupportedProviders).toHaveBeenCalled();
      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            label: GOOGLE_PROVIDER.DISPLAY_NAME,
          }),
        ]),
        {
          placeHolder: "Select a LLM LLM provider",
          ignoreFocusOut: true,
        },
      );

      // Verify configuration updates
      expect(mockConfig.update).toHaveBeenCalledWith(
        "provider",
        PROVIDER_TYPES.GOOGLE,
        vscode.ConfigurationTarget.Workspace,
      );
      expect(mockConfig.update).toHaveBeenCalledWith(
        "apiKey",
        TEST_API_KEYS.GOOGLE,
        vscode.ConfigurationTarget.Workspace,
      );
      expect(mockProviderManager.refreshProviders).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `✅ ${GOOGLE_PROVIDER.DISPLAY_NAME} configured successfully!`,
        "Test Connection",
      );
    });

    it("should handle user cancellation during provider selection", async () => {
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

      await (providerCommands as any).configureLlmProvider();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(vscode.window.showInputBox).not.toHaveBeenCalled();
      expect(mockProviderManager.refreshProviders).not.toHaveBeenCalled();
    });

    it("should handle user cancellation during API key input", async () => {
      const mockProviderInfo = {
        label: GOOGLE_PROVIDER.DISPLAY_NAME,
        description: "Direct access to Google Gemini models",
        detail: PROVIDER_TYPES.GOOGLE,
        provider: {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          configSchema: [
            {
              key: "apiKey",
              label: "API Key",
              type: "password",
              required: true,
              placeholder: "AIza...",
            },
          ],
        },
      };

      const mockConfig = {
        get: vi.fn(() => ""),
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockProviderInfo as any,
      );
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

      await (providerCommands as any).configureLlmProvider();

      expect(vscode.window.showInputBox).toHaveBeenCalled();
      expect(mockConfig.update).toHaveBeenCalledWith(
        "provider",
        PROVIDER_TYPES.GOOGLE,
        vscode.ConfigurationTarget.Workspace,
      );
      // Should not update apiKey or refresh providers if cancelled
      expect(mockConfig.update).not.toHaveBeenCalledWith(
        "apiKey",
        expect.anything(),
        expect.anything(),
      );
      expect(mockProviderManager.refreshProviders).not.toHaveBeenCalled();
    });

    it("should set default endpoint when available", async () => {
      const mockProviderInfo = {
        label: GOOGLE_PROVIDER.DISPLAY_NAME,
        description: "Direct access to Google Gemini models",
        detail: PROVIDER_TYPES.GOOGLE,
        provider: {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          configSchema: [
            {
              key: "apiKey",
              label: "API Key",
              type: "password",
              required: true,
              placeholder: "AIza...",
            },
          ],
          defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
        },
      };

      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === "apiKey") return "";
          if (key === "apiEndpoint") return ""; // Not set
          return undefined;
        }),
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockProviderInfo as any,
      );
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        TEST_API_KEYS.GOOGLE,
      );
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        undefined,
      );

      await (providerCommands as any).configureLlmProvider();

      expect(mockConfig.update).toHaveBeenCalledWith(
        "apiEndpoint",
        "https://generativelanguage.googleapis.com/v1beta",
        vscode.ConfigurationTarget.Workspace,
      );
    });

    it("should handle errors during configuration", async () => {
      vi.mocked(vscode.window.showQuickPick).mockRejectedValue(
        new Error("Configuration error"),
      );

      await (providerCommands as any).configureLlmProvider();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Configuration failed: Configuration error",
      );
    });
  });

  describe("showProviderStatus", () => {
    it("should show status when Google provider is active and connected", async () => {
      const mockStatus: ProviderStatus = {
        connected: true,
        modelInfo: {
          name: MODEL_NAMES.GEMINI_PRO,
          capabilities: ["completion", "chat", "generation"],
        },
      };

      const mockAvailableProviders = [
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: true,
        },
        {
          type: PROVIDER_TYPES.WCA,
          displayName: "Red Hat Ansible Lightspeed",
          active: false,
        },
      ];

      vi.mocked(mockProviderManager.getActiveProvider).mockReturnValue(
        "llmprovider",
      );
      vi.mocked(mockProviderManager.getProviderStatus).mockReturnValue(
        mockStatus,
      );
      vi.mocked(mockProviderManager.getAvailableProviders).mockReturnValue(
        mockAvailableProviders as any,
      );

      const mockDoc = {
        content: "",
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        mockDoc as any,
      );
      vi.mocked(vscode.window.showTextDocument).mockResolvedValue(
        {} as any,
      );

      await (providerCommands as any).showProviderStatus();

      expect(mockProviderManager.getActiveProvider).toHaveBeenCalled();
      expect(mockProviderManager.getProviderStatus).toHaveBeenCalledWith(
        "llmprovider",
      );
      expect(mockProviderManager.getAvailableProviders).toHaveBeenCalled();

      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith({
        content: expect.stringContaining("✅ **Active Provider**: LLMPROVIDER"),
        language: "markdown",
      });

      const callArgs = vi.mocked(vscode.workspace.openTextDocument).mock
        .calls[0][0] as { content: string };
      expect(callArgs.content).toContain(`📋 **Model**: ${MODEL_NAMES.GEMINI_PRO}`);
      expect(callArgs.content).toContain(
        "🔧 **Capabilities**: completion, chat, generation",
      );
      expect(callArgs.content).toContain(
        `🟢 **${GOOGLE_PROVIDER.DISPLAY_NAME}** (${PROVIDER_TYPES.GOOGLE})`,
      );
      expect(callArgs.content).toContain("⚪ **Red Hat Ansible Lightspeed** (wca)");

      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDoc);
    });

    it("should show status when no provider is active", async () => {
      const mockAvailableProviders = [
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: false,
        },
      ];

      vi.mocked(mockProviderManager.getActiveProvider).mockReturnValue(null);
      vi.mocked(mockProviderManager.getAvailableProviders).mockReturnValue(
        mockAvailableProviders as any,
      );

      const mockDoc = {
        content: "",
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        mockDoc as any,
      );
      vi.mocked(vscode.window.showTextDocument).mockResolvedValue(
        {} as any,
      );

      await (providerCommands as any).showProviderStatus();

      const callArgs = vi.mocked(vscode.workspace.openTextDocument).mock
        .calls[0][0] as { content: string };
      expect(callArgs.content).toContain("❌ **No active provider**");
      expect(callArgs.content).toContain(
        `⚪ **${GOOGLE_PROVIDER.DISPLAY_NAME}** (${PROVIDER_TYPES.GOOGLE})`,
      );
    });

    it("should show error status when Google provider is disconnected", async () => {
      const mockStatus: ProviderStatus = {
        connected: false,
        error: "Invalid API key",
      };

      const mockAvailableProviders = [
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: true,
        },
      ];

      vi.mocked(mockProviderManager.getActiveProvider).mockReturnValue(
        "llmprovider",
      );
      vi.mocked(mockProviderManager.getProviderStatus).mockReturnValue(
        mockStatus,
      );
      vi.mocked(mockProviderManager.getAvailableProviders).mockReturnValue(
        mockAvailableProviders as any,
      );

      const mockDoc = {
        content: "",
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        mockDoc as any,
      );
      vi.mocked(vscode.window.showTextDocument).mockResolvedValue(
        {} as any,
      );

      await (providerCommands as any).showProviderStatus();

      const callArgs = vi.mocked(vscode.workspace.openTextDocument).mock
        .calls[0][0] as { content: string };
      expect(callArgs.content).toContain("❌ **Active Provider**: LLMPROVIDER");
      expect(callArgs.content).toContain("⚠️ **Error**: Invalid API key");
    });
  });

  describe("switchProvider", () => {
    it("should switch to Google provider successfully", async () => {
      const mockAvailableProviders = [
        {
          label: GOOGLE_PROVIDER.DISPLAY_NAME,
          description: "",
          detail: PROVIDER_TYPES.GOOGLE,
          provider: {
            type: PROVIDER_TYPES.GOOGLE,
            displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          },
        },
        {
          label: "Red Hat Ansible Lightspeed",
          description: "(Currently Active)",
          detail: PROVIDER_TYPES.WCA,
          provider: {
            type: PROVIDER_TYPES.WCA,
            displayName: "Red Hat Ansible Lightspeed",
          },
        },
      ];

      const mockConfig = {
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any,
      );
      vi.mocked(mockProviderManager.getAvailableProviders).mockReturnValue(
        mockAvailableProviders.map((p) => ({
          type: p.provider.type,
          displayName: p.provider.displayName,
          active: p.description.includes("Active"),
        })) as any,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockAvailableProviders[0] as any,
      );

      await (providerCommands as any).switchProvider();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            label: GOOGLE_PROVIDER.DISPLAY_NAME,
          }),
        ]),
        {
          placeHolder: "Select provider to activate",
          ignoreFocusOut: true,
        },
      );

      expect(mockConfig.update).toHaveBeenCalledWith(
        "provider",
        PROVIDER_TYPES.GOOGLE,
        vscode.ConfigurationTarget.Workspace,
      );
      expect(mockConfig.update).toHaveBeenCalledWith(
        "enabled",
        true,
        vscode.ConfigurationTarget.Workspace,
      );
      expect(mockProviderManager.refreshProviders).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Switched to ${GOOGLE_PROVIDER.DISPLAY_NAME}`,
      );
    });

    it("should handle user cancellation during provider selection", async () => {
      vi.mocked(mockProviderManager.getAvailableProviders).mockReturnValue([
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: false,
        },
      ] as any);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

      await (providerCommands as any).switchProvider();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(vscode.workspace.getConfiguration).not.toHaveBeenCalled();
      expect(mockProviderManager.refreshProviders).not.toHaveBeenCalled();
    });

    it("should handle errors during provider switch", async () => {
      const mockAvailableProviders = [
        {
          label: GOOGLE_PROVIDER.DISPLAY_NAME,
          description: "",
          detail: PROVIDER_TYPES.GOOGLE,
          provider: {
            type: PROVIDER_TYPES.GOOGLE,
            displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          },
        },
      ];

      const mockConfig = {
        update: vi.fn().mockRejectedValue(new Error("Update failed")),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any,
      );
      vi.mocked(mockProviderManager.getAvailableProviders).mockReturnValue(
        mockAvailableProviders.map((p) => ({
          type: p.provider.type,
          displayName: p.provider.displayName,
          active: false,
        })) as any,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockAvailableProviders[0] as any,
      );

      await (providerCommands as any).switchProvider();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to switch provider: Update failed",
      );
    });
  });
});