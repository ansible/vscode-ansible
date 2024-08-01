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
        enabled: lightSpeedSettings.get("enabled", false),
        URL: lightSpeedSettings.get("URL", "https://c.ai.ansible.redhat.com"),
        suggestions: {
          enabled: lightSpeedSettings.get("suggestions.enabled", false),
          waitWindow: lightSpeedSettings.get("suggestions.waitWindow", 0),
        },
        model: lightSpeedSettings.get("modelIdOverride", undefined),
      },
      playbook: {
        arguments: playbookSettings.get("arguments", ""),
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
