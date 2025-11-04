import { expect, config } from "chai";
import { Workbench } from "vscode-extension-tester";
import { openSettings, waitForCondition } from "./uiTestHelper";

config.truncateThreshold = 0;

/**
 * Settings UI Validation Test
 * 
 * This test validates that our package.json contributions are correct
 * and that settings are accessible through VS Code's Settings UI.
 * 
 * We only need ONE test for this because:
 * - Settings UI is VS Code's responsibility
 * - We just verify our contributions exist
 * - Other tests verify settings are APPLIED (more important)
 */
describe("Settings UI Validation", function () {
  let workbench: Workbench;

  before(async function () {
    workbench = new Workbench();
  });

  it("Should verify ansible settings exist and are accessible in Settings UI", async function () {
    this.timeout(15000);

    // Open Settings UI
    const settingsEditor = await openSettings();

    // Critical settings that must exist in the UI
    const criticalSettings = [
      {
        name: "Playbook: Arguments",
        category: "Ansible",
        description: "Arguments for ansible-playbook command",
      },
      {
        name: "Execution Environment: Enabled",
        category: "Ansible",
        description: "Enable Execution Environment",
      },
      {
        name: "Execution Environment: Container Engine",
        category: "Ansible",
        description: "Container engine (podman/docker)",
      },
    ];

    // Verify each critical setting exists and is accessible
    for (const settingInfo of criticalSettings) {
      await waitForCondition({
        condition: async () => {
          try {
            const setting = await settingsEditor.findSetting(
              settingInfo.name,
              settingInfo.category,
            );
            return !!setting;
          } catch {
            return false;
          }
        },
        message: `Setting "${settingInfo.category}.${settingInfo.name}" should exist in Settings UI`,
        timeout: 5000,
        pollTimeout: 200,
      });
    }

    // Verify we can actually interact with a setting (change a value)
    await waitForCondition({
      condition: async () => {
        try {
          const setting = await settingsEditor.findSetting(
            "Playbook: Arguments",
            "Ansible",
          );
          if (!setting) {
            return false;
          }
          // Try to set a value (this proves the setting is editable)
          await setting.setValue("--check");
          return true;
        } catch {
          return false;
        }
      },
      message: "Should be able to set value for ansible.playbook.arguments",
      timeout: 5000,
      pollTimeout: 200,
    });

    // Verify the value was actually set
    const playbookArgsSetting = await settingsEditor.findSetting(
      "Playbook: Arguments",
      "Ansible",
    );
    const currentValue = await playbookArgsSetting.getValue();
    expect(currentValue).to.equal("--check");
  });
});

