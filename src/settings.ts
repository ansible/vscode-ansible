import * as vscode from "vscode";

import { ExtensionSettings } from "./interfaces/extensionSettings";

export class SettingsManager {
  public settings = {} as ExtensionSettings;

  constructor() {
    this.initialize();
    console.log("Initialiased extension settings");
  }

  /**
   * Initialize the extension settings required at the client
   * side
   */
  public initialize(): void {
    const ansibleSettings = vscode.workspace.getConfiguration("ansible");
    const eeSettings = vscode.workspace.getConfiguration(
      "ansible.executionEnvironment"
    );
    this.settings = {
      activationScript: ansibleSettings.get("python.activationScript") as string,
      interpreterPath: ansibleSettings.get("python.interpreterPath") as string,
      executionEnvironment: {
        enabled: eeSettings.get("enabled", false),
        containerEngine: eeSettings.get("containerEngine", "auto"),
        containerOptions: eeSettings.get("containerOptions", ""),
        image: eeSettings.get("image", "quay.io/ansible/creator-ee:latest"),
        pull: {
          arguments: eeSettings.get("pull.arguments", ""),
          policy: eeSettings.get("pull.policy", "missing"),
        },
        volumeMounts: eeSettings.get("volumeMounts", []),
      },
    };
    return;
  }

  public reinitialize(): void {
    this.initialize();
    console.log("Reinitialiased extension settings");
    return;
  }
}
