import * as vscode from "vscode";

import { ExtensionSettings } from "./interfaces/extensionSettings";

export class SettingsManager {
  public settings = {} as ExtensionSettings;

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
        provider: lightSpeedSettings.get("provider", "wca"),
        URL: lightSpeedSettings.get("URL", "https://c.ai.ansible.redhat.com"),
        apiEndpoint: lightSpeedSettings.get("apiEndpoint", ""),
        modelName: lightSpeedSettings.get("modelName", undefined),
        model: lightSpeedSettings.get("modelIdOverride", undefined),
        apiKey: lightSpeedSettings.get("apiKey", ""),
        timeout: lightSpeedSettings.get("timeout", 30000),
        customHeaders: lightSpeedSettings.get("customHeaders", {}),
        suggestions: {
          enabled:
            lightSpeedSettings.get("enabled") === true &&
            lightSpeedSettings.get("suggestions.enabled", true),
          waitWindow: lightSpeedSettings.get("suggestions.waitWindow", 0),
        },
        playbookGenerationCustomPrompt: lightSpeedSettings.get(
          "playbookGenerationCustomPrompt",
          undefined,
        ),
        playbookExplanationCustomPrompt: lightSpeedSettings.get(
          "playbookExplanationCustomPrompt",
          undefined,
        ),
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
      typeof this.settings.lightSpeedService.model === "string" &&
      this.settings.lightSpeedService.model.trim()
    ) {
      this.settings.lightSpeedService.model =
        this.settings.lightSpeedService.model.trim();
    } else {
      this.settings.lightSpeedService.model = undefined;
    }
    return;
  }

  public async reinitialize(): Promise<void> {
    await this.initialize();
    console.log("Reinitialized extension settings");
    return;
  }
}
