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
   * Updates settings by modifying settings.json directly.
   * This is MUCH faster than using the Settings UI (~100ms vs ~10-15s).
   */
  async function updateSettingFast(setting: string, value: any) {
    const driver = VSBrowser.instance.driver;

    await driver.executeScript(
      async (settingKey: string, settingValue: any) => {
        // Use VS Code's internal API to update configuration
        const vscode = await import("vscode");
        const config = vscode.workspace.getConfiguration();
        await config.update(
          settingKey,
          settingValue,
          vscode.ConfigurationTarget.Global,
        );
      },
      setting,
      value,
    );

    // Brief wait for setting to be applied
    await sleep(50);
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
