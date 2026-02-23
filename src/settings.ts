import * as vscode from "vscode";

import { ExtensionSettings } from "./interfaces/extensionSettings";
import { LlmProviderSettings } from "./features/lightspeed/llmProviderSettings";

export class SettingsManager {
  public settings = {} as ExtensionSettings;
  private llmProviderSettings: LlmProviderSettings | undefined;

  /**
   * Set the LlmProviderSettings instance for reading LLM provider configuration
   */
  public setLlmProviderSettings(settings: LlmProviderSettings): void {
    this.llmProviderSettings = settings;
  }

  /**
   * Initialize the extension settings required at the client
   * side
   */
  public async initialize(): Promise<void> {
    const ansibleSettings = vscode.workspace.getConfiguration("ansible");
    const eeSettings = vscode.workspace.getConfiguration(
      "ansible.executionEnvironment",
    );
    const lightSpeedSettings =
      vscode.workspace.getConfiguration("ansible.lightspeed");
    const playbookSettings =
      vscode.workspace.getConfiguration("ansible.playbook");
    const mcpServerSettings =
      vscode.workspace.getConfiguration("ansible.mcpServer");

    // Get LLM provider settings from the dedicated storage if available
    const llmSettings = this.llmProviderSettings
      ? await this.llmProviderSettings.getAllSettings()
      : {
          provider: "wca",
          apiEndpoint: "https://c.ai.ansible.redhat.com",
          modelName: undefined,
          apiKey: "",
        };

    this.settings = {
      activationScript: (await ansibleSettings.get(
        "python.activationScript",
      )) as string,
      interpreterPath: (await ansibleSettings.get(
        "python.interpreterPath",
      )) as string,
      executionEnvironment: {
        enabled: eeSettings.get("enabled", false),
        containerEngine: eeSettings.get("containerEngine", "auto"),
        containerOptions: eeSettings.get("containerOptions", ""),
        image: eeSettings.get(
          "image",
          "ghcr.io/ansible/community-ansible-dev-tools:latest",
        ),
        pull: {
          arguments: eeSettings.get("pull.arguments", ""),
          policy: eeSettings.get("pull.policy", "missing"),
        },
        volumeMounts: eeSettings.get("volumeMounts", []),
      },
      lightSpeedService: {
        enabled: lightSpeedSettings.get("enabled", true),
        provider: llmSettings.provider,
        apiEndpoint: llmSettings.apiEndpoint,
        modelName: llmSettings.modelName,
        apiKey: llmSettings.apiKey,
        timeout: lightSpeedSettings.get("timeout", 30000),
        suggestions: {
          enabled:
            lightSpeedSettings.get("enabled") === true &&
            lightSpeedSettings.get("suggestions.enabled", true),
          waitWindow: lightSpeedSettings.get("suggestions.waitWindow", 0),
        },
      },
      playbook: {
        arguments: playbookSettings.get("arguments", ""),
      },
      mcpServer: {
        enabled: mcpServerSettings.get("enabled", false),
      },
    };

    // Remove whitespace before and after the model ID and if it is empty, set it to undefined
    if (
      typeof this.settings.lightSpeedService.modelName === "string" &&
      this.settings.lightSpeedService.modelName.trim()
    ) {
      this.settings.lightSpeedService.modelName =
        this.settings.lightSpeedService.modelName.trim();
    } else {
      this.settings.lightSpeedService.modelName = undefined;
    }
    return;
  }

  public async reinitialize(): Promise<void> {
    await this.initialize();
    console.log("Reinitialized extension settings");
    return;
  }
}
