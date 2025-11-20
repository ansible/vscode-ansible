import * as vscode from "vscode";
import { LightSpeedManager } from "../base";
import { providerFactory } from "../providers/factory";

export class ProviderCommands {
  constructor(
    private context: vscode.ExtensionContext,
    private lightSpeedManager: LightSpeedManager,
  ) {}

  /**
   * Register all provider-related commands
   */
  registerCommands(): void {
    // Test provider connection command
    const testConnectionCommand = vscode.commands.registerCommand(
      "ansible.lightspeed.testProviderConnection",
      this.testProviderConnection.bind(this),
    );

    // Configure LLM provider command
    const configureProviderCommand = vscode.commands.registerCommand(
      "ansible.lightspeed.configureLlmProvider",
      this.configureLlmProvider.bind(this),
    );

    // Show provider status command
    const showStatusCommand = vscode.commands.registerCommand(
      "ansible.lightspeed.showProviderStatus",
      this.showProviderStatus.bind(this),
    );

    // Switch provider command
    const switchProviderCommand = vscode.commands.registerCommand(
      "ansible.lightspeed.switchProvider",
      this.switchProvider.bind(this),
    );

    this.context.subscriptions.push(
      testConnectionCommand,
      configureProviderCommand,
      showStatusCommand,
      switchProviderCommand,
    );
  }

  /**
   * Test connection to current provider
   */
  private async testProviderConnection(): Promise<void> {
    try {
      const activeProvider =
        this.lightSpeedManager.providerManager.getActiveProvider();

      if (!activeProvider) {
        vscode.window.showWarningMessage(
          "No provider is currently active. Please configure a provider first.",
        );
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Testing ${activeProvider} provider connection...`,
          cancellable: false,
        },
        async () => {
          const status =
            await this.lightSpeedManager.providerManager.testProviderConnection(
              activeProvider,
            );

          if (status.connected) {
            vscode.window.showInformationMessage(
              `✅ ${activeProvider.toUpperCase()} provider connected successfully!`,
              {
                detail: status.modelInfo
                  ? `Model: ${status.modelInfo.name}`
                  : undefined,
              },
            );
          } else {
            vscode.window.showErrorMessage(
              `❌ ${activeProvider.toUpperCase()} provider connection failed: ${status.error}`,
            );
          }
        },
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Configure LLM provider through guided setup
   */
  private async configureLlmProvider(): Promise<void> {
    try {
      const supportedProviders = providerFactory.getSupportedProviders();

      // Step 1: Select provider type
      const providerItems = supportedProviders.map((provider) => ({
        label: provider.displayName,
        description: provider.description,
        detail: provider.type,
        provider: provider,
      }));

      const selectedProvider = await vscode.window.showQuickPick(
        providerItems,
        {
          placeHolder: "Select a LLM LLM provider",
          ignoreFocusOut: true,
        },
      );

      if (!selectedProvider) {
        return;
      }

      // Step 2: Configure provider settings
      const lightspeedConfig =
        vscode.workspace.getConfiguration("ansible.lightspeed");
      await lightspeedConfig.update(
        "provider",
        selectedProvider.provider.type,
        vscode.ConfigurationTarget.Workspace,
      );

      // Configure required fields using the main lightspeed config
      for (const field of selectedProvider.provider.configSchema) {
        if (field.required) {
          const currentValue = lightspeedConfig.get(field.key, "");
          const inputOptions: vscode.InputBoxOptions = {
            prompt: field.label,
            placeHolder: field.placeholder,
            value: currentValue as string,
            ignoreFocusOut: true,
          };

          if (field.type === "password") {
            inputOptions.password = true;
          }

          const value = await vscode.window.showInputBox(inputOptions);

          if (value === undefined) {
            return; // User cancelled
          }

          await lightspeedConfig.update(
            field.key,
            value,
            vscode.ConfigurationTarget.Workspace,
          );
        }
      }

      // Set default endpoint if available and not already set
      if (
        selectedProvider.provider.defaultEndpoint &&
        !lightspeedConfig.get("apiEndpoint")
      ) {
        await lightspeedConfig.update(
          "apiEndpoint",
          selectedProvider.provider.defaultEndpoint,
          vscode.ConfigurationTarget.Workspace,
        );
      }

      // Refresh provider manager
      await this.lightSpeedManager.providerManager.refreshProviders();

      vscode.window
        .showInformationMessage(
          `✅ ${selectedProvider.provider.displayName} configured successfully!`,
          "Test Connection",
        )
        .then((selection) => {
          if (selection === "Test Connection") {
            vscode.commands.executeCommand(
              "ansible.lightspeed.testProviderConnection",
            );
          }
        });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Configuration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Show current provider status
   */
  private async showProviderStatus(): Promise<void> {
    const activeProvider =
      this.lightSpeedManager.providerManager.getActiveProvider();
    const availableProviders =
      this.lightSpeedManager.providerManager.getAvailableProviders();

    let statusMessage = "## Ansible Lightspeed Provider Status\n\n";

    if (!activeProvider) {
      statusMessage += "❌ **No active provider**\n\n";
    } else {
      const status =
        this.lightSpeedManager.providerManager.getProviderStatus(
          activeProvider,
        );
      const statusIcon = status?.connected ? "✅" : "❌";
      statusMessage += `${statusIcon} **Active Provider**: ${activeProvider.toUpperCase()}\n`;

      if (status?.modelInfo) {
        statusMessage += `📋 **Model**: ${status.modelInfo.name}\n`;
        statusMessage += `🔧 **Capabilities**: ${status.modelInfo.capabilities.join(", ")}\n`;
      }

      if (status?.error) {
        statusMessage += `⚠️ **Error**: ${status.error}\n`;
      }

      statusMessage += "\n";
    }

    statusMessage += "### Available Providers:\n";
    for (const provider of availableProviders) {
      const activeIcon = provider.active ? "🟢" : "⚪";
      statusMessage += `${activeIcon} **${provider.displayName}** (${provider.type})\n`;
    }

    // Show in new document
    const doc = await vscode.workspace.openTextDocument({
      content: statusMessage,
      language: "markdown",
    });
    await vscode.window.showTextDocument(doc);
  }

  /**
   * Switch between providers
   */
  private async switchProvider(): Promise<void> {
    const availableProviders =
      this.lightSpeedManager.providerManager.getAvailableProviders();

    const providerItems = availableProviders.map((provider) => ({
      label: provider.displayName,
      description: provider.active ? "(Currently Active)" : "",
      detail: provider.type,
      provider: provider,
    }));

    const selectedProvider = await vscode.window.showQuickPick(providerItems, {
      placeHolder: "Select provider to activate",
      ignoreFocusOut: true,
    });

    if (!selectedProvider) {
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration("ansible.lightspeed");

      // Switch to selected provider
      await config.update(
        "provider",
        selectedProvider.provider.type,
        vscode.ConfigurationTarget.Workspace,
      );
      await config.update(
        "enabled",
        true,
        vscode.ConfigurationTarget.Workspace,
      );

      await this.lightSpeedManager.providerManager.refreshProviders();

      vscode.window.showInformationMessage(
        `Switched to ${selectedProvider.provider.displayName}`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to switch provider: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
