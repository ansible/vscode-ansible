import { expect, config } from "chai";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
  SettingsEditor,
} from "vscode-extension-tester";
import {
  getFixturePath,
  waitForCondition,
  updateSettings,
  safeKillTerminal,
} from "./uiTestHelper";

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
 *
 * NOTE: Settings UI interaction is slow (~10-15s per setting in CI).
 * This is a known limitation of vscode-extension-tester.
 * The dry-run optimization saves ~30s per test, which is the main speedup.
 */
describe(__filename, function () {
  let workbench: Workbench;
  let settingsEditor: SettingsEditor;
  const folder = "terminal";
  const file = "playbook.yml";
  const playbookFile = getFixturePath(folder, file);

  before(async function () {
    this.timeout(15000); // Give more time for Settings UI to load
    workbench = new Workbench();

    // Open Settings with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        settingsEditor = await workbench.openSettings();
        // Verify it's actually open by trying to find a setting
        await settingsEditor.findSetting("Arguments", "Ansible", "Playbook");
        break; // Success!
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error(
            `Failed to open Settings UI after 3 attempts: ${error}`,
          );
        }
        // Wait a bit before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  });

  // Helper to ensure settings editor is still responsive
  async function ensureSettingsReady() {
    try {
      // Quick check if settings editor is still responsive
      await settingsEditor.findSetting("Arguments", "Ansible", "Playbook");
    } catch {
      // Settings became stale, reopen
      settingsEditor = await workbench.openSettings();
    }
  }

  describe("execution of playbook using ansible-playbook command", function () {
    it("Execute ansible-playbook command WITH arguments", async function () {
      this.timeout(35000); // Settings UI is slow in CI (~20s total)

      await ensureSettingsReady();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

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
      await safeKillTerminal(terminalView);
    });

    it("Execute ansible-playbook command WITHOUT arguments", async function () {
      this.timeout(35000); // Settings UI is slow in CI (~20s total)

      await ensureSettingsReady();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");

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
      await safeKillTerminal(terminalView);
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    it("Execute ansible-navigator WITH EE mode", async function () {
      this.timeout(50000); // 2 settings + command = ~35-40s in CI

      await ensureSettingsReady();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        true,
      );
      await updateSettings(
        settingsEditor,
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
      await safeKillTerminal(terminalView);
    });

    it("Execute ansible-navigator WITHOUT EE mode", async function () {
      this.timeout(35000); // Settings UI is slow in CI (~20s total)

      await ensureSettingsReady();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        false,
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
          return text.includes("ansible-navigator") && text.includes("run");
        },
        message: `Expected ansible-navigator without EE flags. Got: ${text}`,
        timeout: 8000,
      });

      expect(text).to.contain("ansible-navigator");
      expect(text).not.to.contain("--ee");
      await safeKillTerminal(terminalView);
    });
  });
});
