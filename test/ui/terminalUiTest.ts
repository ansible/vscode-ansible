import { expect, config } from "chai";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
  SettingsEditor,
  EditorView,
} from "vscode-extension-tester";
import {
  getFixturePath,
  waitForCondition,
  sleep,
  updateSettings,
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
 */
describe(__filename, function () {
  let workbench: Workbench;
  let settingsEditor: SettingsEditor;
  let bottomBarPanel: BottomBarPanel;
  const folder = "terminal";
  const file = "playbook.yml";
  const playbookFile = getFixturePath(folder, file);

  before(async function () {
    workbench = new Workbench();
    // Initialize BottomBarPanel once
    bottomBarPanel = new BottomBarPanel();
  });

  afterEach(async function () {
    // Clean up after each test to prevent UI state accumulation
    try {
      const editorView = new EditorView();
      await editorView.closeAllEditors();
    } catch (error) {
      console.log("Cleanup warning:", error);
      // Don't fail the test if cleanup has issues
    }
  });

  // Helper to get fresh settings editor for each test
  async function getFreshSettings(): Promise<SettingsEditor> {
    // Close all editors to clean UI state
    const editorView = new EditorView();
    await editorView.closeAllEditors();

    // Open settings with retry logic
    for (let i = 0; i < 3; i++) {
      try {
        const editor = await workbench.openSettings();
        return editor;
      } catch (error) {
        console.log(`Attempt ${i + 1} to open settings failed:`, error);
        if (i === 2) throw error;
      }
    }
    throw new Error("Failed to open settings after 3 attempts");
  }

  describe("execution of playbook using ansible-playbook command", function () {
    it("Execute ansible-playbook command WITH arguments", async function () {
      // Get fresh settings editor for this test
      settingsEditor = await getFreshSettings();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      // Open playbook file and execute command
      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await bottomBarPanel.openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return (
            text.includes("ansible-playbook") && text.includes("--syntax-check")
          );
        },
        message: `Expected ansible-playbook with --syntax-check. Got: ${text}`,
        timeout: 10000,
      });

      // Verify arguments are included
      expect(text).to.contain("--syntax-check");
    });

    it("Execute ansible-playbook command WITHOUT arguments", async function () {
      // Get fresh settings editor for this test
      settingsEditor = await getFreshSettings();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");

      // Open playbook file and execute command
      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await bottomBarPanel.openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-playbook") && text.includes(file);
        },
        message: `Expected ansible-playbook without arguments. Got: ${text}`,
        timeout: 10000,
      });

      // Verify NO --syntax-check argument
      expect(text).to.contain("ansible-playbook");
      expect(text).not.to.contain("--syntax-check");
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    it("Execute ansible-navigator WITH EE mode", async function () {
      // Get fresh settings editor for this test
      settingsEditor = await getFreshSettings();
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

      // Open playbook file and execute command
      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand(
        "Run playbook via `ansible-navigator run`",
      );

      const terminalView = await bottomBarPanel.openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-navigator") && text.includes("--ee");
        },
        message: `Expected ansible-navigator with EE flags. Got: ${text}`,
        timeout: 10000,
      });

      // Verify EE mode flags are included
      expect(text).to.contain("--ee");
      expect(text).to.contain("--ce");
      expect(text).to.contain("podman");
    });

    it("Execute ansible-navigator WITHOUT EE mode", async function () {
      // Get fresh settings editor for this test
      settingsEditor = await getFreshSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        false,
      );

      // Open playbook file and execute command
      await VSBrowser.instance.openResources(playbookFile);
      await sleep(30); // Wait for file to open
      await workbench.executeCommand(
        "Run playbook via `ansible-navigator run`",
      );

      const terminalView = await bottomBarPanel.openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-navigator") && text.includes("run");
        },
        message: `Expected ansible-navigator without EE flags. Got: ${text}`,
        timeout: 10000,
      });

      // Verify NO EE mode flags
      expect(text).to.contain("ansible-navigator");
      expect(text).not.to.contain("--ee");
    });
  });
});
