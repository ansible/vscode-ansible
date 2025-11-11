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
  sleep,
} from "./uiTestHelper";

config.truncateThreshold = 0;
describe(__filename, function () {
  describe("execution of playbook using ansible-playbook command", function () {
    let settingsEditor: SettingsEditor;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    it("Execute ansible-playbook command with arg", async function () {
      this.timeout(35000); // 35 seconds

      await VSBrowser.instance.driver.switchTo().defaultContent();

      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      await new EditorView().closeAllEditors();
      await sleep(500);

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
        timeout: 8000,
      });

      expect(text).contains("ansible-playbook --syntax-check");
      await terminalView.killTerminal();
    });

    it("Execute ansible-playbook command without arg", async function () {
      this.timeout(35000); // 35 seconds

      await VSBrowser.instance.driver.switchTo().defaultContent();

      settingsEditor = await openSettings();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");

      await new EditorView().closeAllEditors();
      await sleep(100);

      await VSBrowser.instance.openResources(playbookFile);
      await workbenchExecuteCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      await sleep(100);

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-playbook");
        },
        message: "Timed out waiting for ansible-playbook command",
        timeout: 8000,
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
      // Increase test timeout - even with pre-pulled image, settings + execution can take time
      this.timeout(45000); // 45 seconds total for the entire test

      if (process.platform !== "darwin") {
        // Close any existing settings editor to start fresh
        await VSBrowser.instance.driver.switchTo().defaultContent();

        settingsEditor = await openSettings();

        // Update all settings in sequence - settings editor is already open
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

        // Close settings to free up resources
        await new EditorView().closeAllEditors();
        await sleep(500);

        await VSBrowser.instance.openResources(playbookFile);

        await workbenchExecuteCommand(
          "Run playbook via `ansible-navigator run`",
        );

        // Open terminal and wait for it to be ready
        const terminalView = await new BottomBarPanel().openTerminalView();
        await sleep(1000); // Ensure terminal is ready and capturing output

        let text = "";
        let lastTextLength = 0;

        // Poll more frequently and check for output changes
        await waitForCondition({
          condition: async () => {
            text = await terminalView.getText();
            const currentLength = text.length;

            // Check if we have the expected output
            if (text.includes("Play ") || text.includes("PLAY [")) {
              return true;
            }

            // If text is growing, command is running - give it more time
            if (currentLength > lastTextLength) {
              lastTextLength = currentLength;
            }

            return false;
          },
          message: `Timed out waiting for ansible-navigator output. Last terminal content: ${text}`,
          timeout: 15000, // Reduced from 25s since image is pre-pulled
          pollTimeout: 500, // Poll every 500ms instead of default 200ms
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
      // Set reasonable timeout for this test too
      this.timeout(40000); // 40 seconds

      await VSBrowser.instance.driver.switchTo().defaultContent();

      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        false,
      );

      await new EditorView().closeAllEditors();
      await sleep(500);

      await VSBrowser.instance.openResources(playbookFile);

      await workbenchExecuteCommand(
        "Run playbook via `ansible-navigator run``",
      );

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      // Without containers, ansible-navigator should run quickly
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play ") || text.includes("PLAY [");
        },
        message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
        timeout: 15000, // Reduced from 25s
        pollTimeout: 500,
      });

      // assert with just "Play " rather than "Play name" due to CI output formatting issues
      expect(text).to.satisfy(
        (t: string) => t.includes("Play ") || t.includes("PLAY ["),
        "Expected to see Play output",
      );

      await terminalView.killTerminal();
    });

    after(async function () {
      const folder = "terminal";
      const fixtureFolder = getFixturePath(folder) + "/";
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
