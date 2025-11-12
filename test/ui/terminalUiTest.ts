import { expect, config } from "chai";
import fs from "fs";
import {
  BottomBarPanel,
  VSBrowser,
  SettingsEditor,
  EditorView,
} from "vscode-extension-tester";
import {
  getFixturePath,
  updateSettings,
  waitForCondition,
  openSettings,
  workbenchExecuteCommand,
} from "./uiTestHelper";

config.truncateThreshold = 0;
describe(__filename, function () {
  describe("execution of playbook using ansible-playbook command", function () {
    let settingsEditor: SettingsEditor;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    it("Execute ansible-playbook command with arg", async function () {
      await VSBrowser.instance.driver.switchTo().defaultContent();

      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      await new EditorView().closeAllEditors();

      await VSBrowser.instance.openResources(playbookFile);

      await workbenchExecuteCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-playbook");
        },
        message: "Timed out waiting for ansible-playbook command",
        timeout: 3000, // Very fast for local command
        pollTimeout: 150,
      });

      expect(text).contains("ansible-playbook --syntax-check");
      await terminalView.killTerminal();
    });

    it("Execute ansible-playbook command without arg", async function () {
      await VSBrowser.instance.driver.switchTo().defaultContent();

      settingsEditor = await openSettings();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");

      await new EditorView().closeAllEditors();

      await VSBrowser.instance.openResources(playbookFile);
      await workbenchExecuteCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-playbook");
        },
        message: "Timed out waiting for ansible-playbook command",
        timeout: 3000, // Very fast for local command
        pollTimeout: 150,
      });

      expect(text).contains("ansible-playbook ");
      expect(text).does.not.contain("ansible-playbook --");

      await terminalView.killTerminal();
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    let settingsEditor: SettingsEditor;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    before(async function () {
      // Note: Container image should be pre-pulled by CI setup
      // This hook is here for any future setup needs
    });

    // Skip this test on macOS due to CI container settings
    it("Execute playbook with ansible-navigator EE mode", async function () {
      // CI requires more time: settings (10s) + container startup (15s) + execution (5s)
      this.timeout(40000);

      if (process.platform !== "darwin") {
        // Ensure clean state
        await VSBrowser.instance.driver.switchTo().defaultContent();
        await new EditorView().closeAllEditors();

        // Open settings once and update all settings sequentially
        settingsEditor = await openSettings();
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
        await updateSettings(
          settingsEditor,
          "ansible.executionEnvironment.pull.policy",
          "missing",
        );

        // Close settings before running command
        await new EditorView().closeAllEditors();

        await VSBrowser.instance.openResources(playbookFile);

        await workbenchExecuteCommand(
          "Run playbook via `ansible-navigator run`",
        );

        // Open terminal and wait for it to be ready
        const terminalView = await new BottomBarPanel().openTerminalView();

        let text = "";

        // Poll for output - container startup in CI can take time even with pre-pulled image
        await waitForCondition({
          condition: async () => {
            text = await terminalView.getText();
            return text.includes("Play ") || text.includes("PLAY [");
          },
          message: `Timed out waiting for ansible-navigator output. Last terminal content: ${text}`,
          timeout: 10000, // Pre-pulled image makes this faster
          pollTimeout: 150,
        });

        // Verify we got the expected output
        expect(text).to.satisfy(
          (t: string) => t.includes("Play ") || t.includes("PLAY ["),
          "Expected to see 'Play ' or 'PLAY [' in terminal output",
        );
        await terminalView.killTerminal();
      }
    });

    it("Execute playbook with ansible-navigator without EE mode", async function () {
      // CI needs more time: settings (10s) + execution (12s)
      this.timeout(30000);

      // Ensure clean state
      await VSBrowser.instance.driver.switchTo().defaultContent();
      await new EditorView().closeAllEditors();

      // Open settings and update
      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        false,
      );

      // Close settings before running command
      await new EditorView().closeAllEditors();

      await VSBrowser.instance.openResources(playbookFile);

      await workbenchExecuteCommand(
        "Run playbook via `ansible-navigator run``",
      );

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      // Without containers, but CI still needs time
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play ") || text.includes("PLAY [");
        },
        message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
        timeout: 15000, // CI can be slow even without containers
        pollTimeout: 200,
      });

      // assert with just "Play " rather than "Play name" due to CI output formatting issues
      expect(text).to.satisfy(
        (t: string) => t.includes("Play ") || t.includes("PLAY ["),
        "Expected to see Play output",
      );

      await terminalView.killTerminal();
    });

    after(async function () {
      this.timeout(20000); // CI cleanup needs more time

      const folder = "terminal";
      const fixtureFolder = getFixturePath(folder) + "/";

      // Ensure clean state
      await new EditorView().closeAllEditors();

      // Update both settings sequentially
      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.containerEngine",
        "docker",
      );
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.pull.policy",
        "missing",
      );
      fs.readdirSync(fixtureFolder).forEach((file) => {
        if (file.includes("playbook-artifact")) {
          fs.unlinkSync(fixtureFolder + file);
        }
      });
    });
  });
});
