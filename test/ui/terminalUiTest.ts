import { expect, config } from "chai";
import { Workbench, BottomBarPanel, VSBrowser } from "vscode-extension-tester";
import { getFixturePath, waitForCondition, sleep } from "./uiTestHelper";

config.truncateThreshold = 0;

/**
 * Terminal UI Tests - Original 4 Test Scenarios
 *
 * Tests the 4 original scenarios:
 * 1. ansible-playbook WITH arguments (--syntax-check)
 * 2. ansible-playbook WITHOUT arguments (empty)
 * 3. ansible-navigator WITH EE mode (enabled + podman)
 * 4. ansible-navigator WITHOUT EE mode (disabled)
 *
 * With dry-run mode enabled, commands are echoed instead of executed,
 * making tests fast and reliable.
 */
describe(__filename, function () {
  let workbench: Workbench;
  const folder = "terminal";
  const file = "playbook.yml";
  const playbookFile = getFixturePath(folder, file);

  before(async function () {
    workbench = new Workbench();
  });

  /**
   * Updates settings by editing settings.json through Monaco editor.
   * This is MUCH faster than searching through Settings UI (~1-2s vs ~10-15s).
   */
  async function updateSettingFast(setting: string, value: any) {
    // Open settings.json editor
    await workbench.executeCommand("Preferences: Open User Settings (JSON)");
    await sleep(300); // Wait for editor to open

    const driver = VSBrowser.instance.driver;

    // Use Monaco editor API to update the setting
    await driver.executeScript(
      (settingKey: string, settingValue: any) => {
        // Access Monaco editor (available in VS Code webview)
        const monaco = (window as any).monaco;
        if (!monaco) {
          throw new Error("Monaco editor not available");
        }

        // Get the active text editor
        const editors = monaco.editor.getEditors();
        if (!editors || editors.length === 0) {
          throw new Error("No active editor found");
        }

        const editor = editors[0];
        const model = editor.getModel();

        // Get current content
        const content = model.getValue();

        // Parse JSON
        let settings: any;
        try {
          settings = JSON.parse(content || "{}");
        } catch {
          settings = {};
        }

        // Update the setting
        settings[settingKey] = settingValue;

        // Write back formatted JSON
        model.setValue(JSON.stringify(settings, null, 2));
      },
      setting,
      value,
    );

    // Save and close
    await workbench.executeCommand("File: Save");
    await sleep(100); // Wait for save to complete
    await workbench.executeCommand("View: Close Editor");

    // Small delay for VS Code to apply the setting
    await sleep(100);
  }

  describe("execution of playbook using ansible-playbook command", function () {
    it("Execute ansible-playbook command WITH arguments", async function () {
      this.timeout(10000); // Should be fast now (~3-5s expected)

      await updateSettingFast("ansible.playbook.arguments", "--syntax-check");

      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return (
            text.includes("ansible-playbook") && text.includes("--syntax-check")
          );
        },
        message: `Expected ansible-playbook with --syntax-check. Got: ${text}`,
        timeout: 8000,
      });

      expect(text).to.contain("ansible-playbook");
      expect(text).to.contain("--syntax-check");
      await terminalView.killTerminal();
    });

    it("Execute ansible-playbook command WITHOUT arguments", async function () {
      this.timeout(10000); // Should be fast now (~3-5s expected)

      await updateSettingFast("ansible.playbook.arguments", " ");

      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-playbook") && text.includes(file);
        },
        message: `Expected ansible-playbook without arguments. Got: ${text}`,
        timeout: 8000,
      });

      expect(text).to.contain("ansible-playbook");
      expect(text).not.to.contain("--syntax-check");
      await terminalView.killTerminal();
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    it("Execute ansible-navigator WITH EE mode", async function () {
      this.timeout(10000); // Should be fast now (~3-5s expected)

      // Update both settings - now fast!
      await updateSettingFast("ansible.executionEnvironment.enabled", true);
      await updateSettingFast(
        "ansible.executionEnvironment.containerEngine",
        "podman",
      );

      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand(
        "Run playbook via `ansible-navigator run`",
      );

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play ") && text.includes("--ee");
        },
        message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
        timeout: 15000,
      });

      expect(text).to.contain("ansible-navigator");
      expect(text).to.contain("--ee");
      expect(text).to.contain("--ce");
      expect(text).to.contain("podman");
      await terminalView.killTerminal();
    });

    it("Execute ansible-navigator WITHOUT EE mode", async function () {
      this.timeout(10000); // Should be fast now (~3-5s expected)

      await updateSettingFast("ansible.executionEnvironment.enabled", false);

      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand(
        "Run playbook via `ansible-navigator run`",
      );

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-navigator") && text.includes("run");
        },
        message: `Expected ansible-navigator without EE flags. Got: ${text}`,
        timeout: 8000,
      });

      expect(text).to.contain("ansible-navigator");
      expect(text).not.to.contain("--ee");
      await terminalView.killTerminal();
    });
  });
});
