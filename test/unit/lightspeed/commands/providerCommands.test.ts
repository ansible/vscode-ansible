import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ProviderCommands } from "../../../../src/features/lightspeed/commands/providerCommands";
import type { LightSpeedManager } from "../../../../src/features/lightspeed/base";
import type { ProviderManager } from "../../../../src/features/lightspeed/providerManager";
import type { LlmProviderSettings } from "../../../../src/features/lightspeed/llmProviderSettings";
import { ProviderStatus } from "../../../../src/features/lightspeed/providers/base";
import {
  PROVIDER_TYPES,
  TEST_API_KEYS,
  MODEL_NAMES,
  GOOGLE_PROVIDER,
} from "../testConstants";

vi.mock("../../../../src/features/lightspeed/providers/factory", () => {
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
import { providerFactory } from "../../../../src/features/lightspeed/providers/factory";

describe("ProviderCommands", () => {
  let providerCommands: ProviderCommands;
  let mockContext: vscode.ExtensionContext;
  let mockLightSpeedManager: LightSpeedManager;
  let mockProviderManager: ProviderManager;
  let mockLlmProviderSettings: LlmProviderSettings;
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

    // Setup mock LLM provider settings
    mockLlmProviderSettings = {
      getProvider: vi.fn().mockReturnValue("wca"),
      setProvider: vi.fn().mockResolvedValue(undefined),
      getModelName: vi.fn().mockReturnValue(undefined),
      setModelName: vi.fn().mockResolvedValue(undefined),
      getApiEndpoint: vi.fn().mockReturnValue("https://c.ai.ansible.redhat.com"),
      setApiEndpoint: vi.fn().mockResolvedValue(undefined),
      getApiKey: vi.fn().mockResolvedValue(""),
      setApiKey: vi.fn().mockResolvedValue(undefined),
      getAllSettings: vi.fn().mockResolvedValue({
        provider: "wca",
        modelName: undefined,
        apiEndpoint: "https://c.ai.ansible.redhat.com",
        apiKey: "",
      }),
      setAllSettings: vi.fn().mockResolvedValue(undefined),
      clearAllSettings: vi.fn().mockResolvedValue(undefined),
    } as unknown as LlmProviderSettings;

    // Setup mock workspace configuration
    const mockConfig = {
      get: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      mockConfig as unknown as vscode.WorkspaceConfiguration,
    );

    providerCommands = new ProviderCommands(
      mockContext,
      mockLightSpeedManager,
      mockLlmProviderSettings,
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
      const getActiveProvider = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getActiveProvider,
      );
      getActiveProvider.mockReturnValue(null);

      // Access private method via type assertion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).testProviderConnection();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No provider is currently active. Please configure a provider first.",
      );
      const testProviderConnection2 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.testProviderConnection,
      );
      expect(testProviderConnection2).not.toHaveBeenCalled();
    });

    it("should test Google provider connection successfully", async () => {
      const mockStatus: ProviderStatus = {
        connected: true,
        modelInfo: {
          name: MODEL_NAMES.GEMINI_PRO,
          capabilities: ["completion", "chat", "generation"],
        },
      };

      const getActiveProvider2 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getActiveProvider,
      );
      const testProviderConnection = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.testProviderConnection,
      );
      getActiveProvider2.mockReturnValue("llmprovider");
      testProviderConnection.mockResolvedValue(mockStatus);

      // Mock withProgress to execute the callback immediately
      vi.mocked(vscode.window.withProgress).mockImplementation(
        async (options, task) => {
          const mockProgress: vscode.Progress<{ message?: string }> = {
            report: vi.fn(),
          };
          const mockToken: vscode.CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: vi.fn(),
          } as vscode.CancellationToken;
          return await task(mockProgress, mockToken);
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).testProviderConnection();

      expect(testProviderConnection).toHaveBeenCalledWith("llmprovider");
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

      const getActiveProvider = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getActiveProvider,
      );
      const testProviderConnection = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.testProviderConnection,
      );
      getActiveProvider.mockReturnValue("llmprovider");
      testProviderConnection.mockResolvedValue(mockStatus);

      vi.mocked(vscode.window.withProgress).mockImplementation(
        async (options, task) => {
          const mockProgress: vscode.Progress<{ message?: string }> = {
            report: vi.fn(),
          };
          const mockToken: vscode.CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: vi.fn(),
          } as vscode.CancellationToken;
          return await task(mockProgress, mockToken);
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          if (key === "apiEndpoint") return undefined;
          return undefined;
        }),
        update: vi.fn(),
        inspect: vi.fn((key: string) => {
          if (key === "provider") {
            return {
              workspaceValue: PROVIDER_TYPES.GOOGLE,
            };
          }
          return undefined;
        }),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as unknown as vscode.WorkspaceConfiguration,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockProviderInfo as unknown as vscode.QuickPickItem & {
          provider: unknown;
        },
      );
      vi.mocked(vscode.window.showInputBox)
        .mockResolvedValueOnce(TEST_API_KEYS.GOOGLE) // API key
        .mockResolvedValueOnce(undefined); // Model name (optional, cancelled)
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        undefined,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).configureLlmProvider();

      const getSupportedProviders = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        providerFactory.getSupportedProviders,
      );
      const showQuickPick5 = vi.mocked(vscode.window.showQuickPick);
      expect(getSupportedProviders).toHaveBeenCalled();
      expect(showQuickPick5).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            label: GOOGLE_PROVIDER.DISPLAY_NAME,
          }),
        ]),
        {
          placeHolder: "Select a LLM provider",
          ignoreFocusOut: true,
        },
      );

      // Verify LlmProviderSettings updates
      const setProvider = vi.mocked(mockLlmProviderSettings.setProvider);
      const setApiKey = vi.mocked(mockLlmProviderSettings.setApiKey);
      expect(setProvider).toHaveBeenCalledWith(PROVIDER_TYPES.GOOGLE);
      expect(setApiKey).toHaveBeenCalledWith(TEST_API_KEYS.GOOGLE);
      const refreshProviders = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.refreshProviders,
      );
      expect(refreshProviders).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `✅ ${GOOGLE_PROVIDER.DISPLAY_NAME} configured successfully!`,
        "Test Connection",
      );
    });

    it("should handle user cancellation during provider selection", async () => {
      const showQuickPick6 = vi.mocked(vscode.window.showQuickPick);
      const showInputBox = vi.mocked(vscode.window.showInputBox);
      const refreshProviders2 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.refreshProviders,
      );
      showQuickPick6.mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).configureLlmProvider();

      expect(showQuickPick6).toHaveBeenCalled();
      expect(showInputBox).not.toHaveBeenCalled();
      expect(refreshProviders2).not.toHaveBeenCalled();
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
        mockConfig as unknown as vscode.WorkspaceConfiguration,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockProviderInfo as unknown as vscode.QuickPickItem & {
          provider: unknown;
        },
      );
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).configureLlmProvider();

      expect(vscode.window.showInputBox).toHaveBeenCalled();
      const setProvider = vi.mocked(mockLlmProviderSettings.setProvider);
      expect(setProvider).toHaveBeenCalledWith(PROVIDER_TYPES.GOOGLE);
      // Should not update apiKey or refresh providers if cancelled
      const setApiKey = vi.mocked(mockLlmProviderSettings.setApiKey);
      expect(setApiKey).not.toHaveBeenCalled();
      const refreshProviders4 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.refreshProviders,
      );
      expect(refreshProviders4).not.toHaveBeenCalled();
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
          if (key === "apiEndpoint") return undefined; // Not set
          return undefined;
        }),
        update: vi.fn(),
        inspect: vi.fn((key: string) => {
          if (key === "provider") {
            return {
              workspaceValue: PROVIDER_TYPES.GOOGLE,
            };
          }
          return undefined;
        }),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as unknown as vscode.WorkspaceConfiguration,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        mockProviderInfo as unknown as vscode.QuickPickItem & {
          provider: unknown;
        },
      );
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        TEST_API_KEYS.GOOGLE,
      );
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        undefined,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).configureLlmProvider();

      const setApiEndpoint = vi.mocked(mockLlmProviderSettings.setApiEndpoint);
      expect(setApiEndpoint).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta",
      );
    });

    it("should handle errors during configuration", async () => {
      const showQuickPick7 = vi.mocked(vscode.window.showQuickPick);
      showQuickPick7.mockRejectedValue(new Error("Configuration error"));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      const getActiveProvider = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getActiveProvider,
      );
      const getProviderStatus = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getProviderStatus,
      );
      const getAvailableProviders = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getAvailableProviders,
      );
      getActiveProvider.mockReturnValue("llmprovider");
      getProviderStatus.mockReturnValue(mockStatus);
      getAvailableProviders.mockReturnValue(
        mockAvailableProviders as unknown as Array<{
          type: string;
          displayName: string;
          active: boolean;
        }>,
      );

      const mockDoc = {
        content: "",
      };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
        mockDoc as unknown as vscode.TextDocument,
      );
      vi.mocked(vscode.window.showTextDocument).mockResolvedValue(
        {} as unknown as vscode.TextEditor,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).showProviderStatus();

      expect(getActiveProvider).toHaveBeenCalled();
      expect(getProviderStatus).toHaveBeenCalledWith("llmprovider");
      expect(getAvailableProviders).toHaveBeenCalled();

      const openTextDocument = vi.mocked(vscode.workspace.openTextDocument);
      const showTextDocument = vi.mocked(vscode.window.showTextDocument);
      expect(openTextDocument).toHaveBeenCalledWith({
        content: expect.stringContaining("✅ **Active Provider**: LLMPROVIDER"),
        language: "markdown",
      });

      const callArgs = openTextDocument.mock.calls[0][0] as {
        content: string;
      };
      expect(callArgs.content).toContain(
        `📋 **Model**: ${MODEL_NAMES.GEMINI_PRO}`,
      );
      expect(callArgs.content).toContain(
        "🔧 **Capabilities**: completion, chat, generation",
      );
      expect(callArgs.content).toContain(
        `🟢 **${GOOGLE_PROVIDER.DISPLAY_NAME}** (${PROVIDER_TYPES.GOOGLE})`,
      );
      expect(callArgs.content).toContain(
        "⚪ **Red Hat Ansible Lightspeed** (wca)",
      );

      expect(showTextDocument).toHaveBeenCalledWith(mockDoc);
    });

    it("should show status when no provider is active", async () => {
      const mockAvailableProviders = [
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: false,
        },
      ];

      const getActiveProvider = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getActiveProvider,
      );
      const getAvailableProviders = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getAvailableProviders,
      );
      getActiveProvider.mockReturnValue(null);
      getAvailableProviders.mockReturnValue(
        mockAvailableProviders as unknown as Array<{
          type: string;
          displayName: string;
          active: boolean;
        }>,
      );

      const mockDoc = {
        content: "",
      };
      const openTextDocument4 = vi.mocked(vscode.workspace.openTextDocument);
      const showTextDocument4 = vi.mocked(vscode.window.showTextDocument);
      openTextDocument4.mockResolvedValue(
        mockDoc as unknown as vscode.TextDocument,
      );
      showTextDocument4.mockResolvedValue({} as unknown as vscode.TextEditor);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).showProviderStatus();

      const callArgs = openTextDocument4.mock.calls[0][0] as {
        content: string;
      };
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

      const getActiveProvider = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getActiveProvider,
      );
      const getProviderStatus = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getProviderStatus,
      );
      const getAvailableProviders = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getAvailableProviders,
      );
      getActiveProvider.mockReturnValue("llmprovider");
      getProviderStatus.mockReturnValue(mockStatus);
      getAvailableProviders.mockReturnValue(
        mockAvailableProviders as unknown as Array<{
          type: string;
          displayName: string;
          active: boolean;
        }>,
      );

      const mockDoc = {
        content: "",
      };
      const openTextDocument5 = vi.mocked(vscode.workspace.openTextDocument);
      const showTextDocument5 = vi.mocked(vscode.window.showTextDocument);
      openTextDocument5.mockResolvedValue(
        mockDoc as unknown as vscode.TextDocument,
      );
      showTextDocument5.mockResolvedValue({} as unknown as vscode.TextEditor);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).showProviderStatus();

      const callArgs = openTextDocument5.mock.calls[0][0] as {
        content: string;
      };
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

      const getConfiguration = vi.mocked(vscode.workspace.getConfiguration);
      const getAvailableProviders = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getAvailableProviders,
      );
      const showQuickPick = vi.mocked(vscode.window.showQuickPick);
      getConfiguration.mockReturnValue(
        mockConfig as unknown as vscode.WorkspaceConfiguration,
      );
      getAvailableProviders.mockReturnValue(
        mockAvailableProviders.map((p) => ({
          type: p.provider.type,
          displayName: p.provider.displayName,
          active: p.description.includes("Active"),
        })) as unknown as Array<{
          type: string;
          displayName: string;
          active: boolean;
        }>,
      );
      showQuickPick.mockResolvedValue(
        mockAvailableProviders[0] as unknown as vscode.QuickPickItem & {
          provider: unknown;
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).switchProvider();

      expect(showQuickPick).toHaveBeenCalledWith(
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

      // Verify LlmProviderSettings was used for provider
      const setProvider = vi.mocked(mockLlmProviderSettings.setProvider);
      expect(setProvider).toHaveBeenCalledWith(PROVIDER_TYPES.GOOGLE);
      // Verify VS Code config was used for enabled
      expect(mockConfig.update).toHaveBeenCalledWith(
        "enabled",
        true,
        vscode.ConfigurationTarget.Workspace,
      );
      const refreshProviders3 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.refreshProviders,
      );
      expect(refreshProviders3).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Switched to ${GOOGLE_PROVIDER.DISPLAY_NAME}`,
      );
    });

    it("should handle user cancellation during provider selection", async () => {
      const getAvailableProviders5 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getAvailableProviders,
      );
      const showQuickPick4 = vi.mocked(vscode.window.showQuickPick);
      const getConfiguration4 = vi.mocked(vscode.workspace.getConfiguration);
      getAvailableProviders5.mockReturnValue([
        {
          type: PROVIDER_TYPES.GOOGLE,
          displayName: GOOGLE_PROVIDER.DISPLAY_NAME,
          active: false,
        },
      ] as unknown as Array<{
        type: string;
        displayName: string;
        active: boolean;
      }>);
      showQuickPick4.mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).switchProvider();

      expect(showQuickPick4).toHaveBeenCalled();
      expect(getConfiguration4).not.toHaveBeenCalled();
      const refreshProviders5 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.refreshProviders,
      );
      expect(refreshProviders5).not.toHaveBeenCalled();
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

      const getConfiguration3 = vi.mocked(vscode.workspace.getConfiguration);
      const getAvailableProviders3 = vi.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockProviderManager.getAvailableProviders,
      );
      const showQuickPick3 = vi.mocked(vscode.window.showQuickPick);
      getConfiguration3.mockReturnValue(
        mockConfig as unknown as vscode.WorkspaceConfiguration,
      );
      getAvailableProviders3.mockReturnValue(
        mockAvailableProviders.map((p) => ({
          type: p.provider.type,
          displayName: p.provider.displayName,
          active: false,
        })) as unknown as Array<{
          type: string;
          displayName: string;
          active: boolean;
        }>,
      );
      showQuickPick3.mockResolvedValue(
        mockAvailableProviders[0] as unknown as vscode.QuickPickItem & {
          provider: unknown;
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (providerCommands as any).switchProvider();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to switch provider: Update failed",
      );
    });
  });
});
