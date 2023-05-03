import * as vscode from "vscode";

import { ExtensionSettings } from "./interfaces/extensionSettings";

export class SettingsManager {
  public settings = {} as ExtensionSettings;

  constructor() {
    this.initialize();
    console.log("Initialized extension settings");
  }

  /**
   * Initialize the extension settings required at the client
   * side
   */
  public async initialize(): Promise<void> {
    const ansibleSettings = vscode.workspace.getConfiguration("ansible");
    const eeSettings = vscode.workspace.getConfiguration(
      "ansible.executionEnvironment"
    );
    const lightSpeedSettings =
      vscode.workspace.getConfiguration("ansible.lightspeed");
    this.settings = {
      activationScript: (await ansibleSettings.get(
        "python.activationScript"
      )) as string,
      interpreterPath: (await ansibleSettings.get(
        "python.interpreterPath"
      )) as string,
      executionEnvironment: {
        enabled: eeSettings.get("enabled", false),
        containerEngine: eeSettings.get("containerEngine", "auto"),
        containerOptions: eeSettings.get("containerOptions", ""),
        image: eeSettings.get("image", "ghcr.io/ansible/creator-ee:latest"),
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
        },
      },
    };
    return;
  }

  public async reinitialize(): Promise<void> {
    await this.initialize();
    console.log("Reinitialized extension settings");
    return;
  }
}
