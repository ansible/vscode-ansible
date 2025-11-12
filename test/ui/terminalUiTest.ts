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
      await sleep(100); // Let UI stabilize after context switch

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
      // Timeout accounts for: 3x settings operations (30s) + container startup (20s)
      this.timeout(60000);

      if (process.platform !== "darwin") {
        // Ensure clean state
        await VSBrowser.instance.driver.switchTo().defaultContent();
        await new EditorView().closeAllEditors();

        // Open settings fresh
        settingsEditor = await openSettings();
        await updateSettings(
          settingsEditor,
          "ansible.executionEnvironment.enabled",
          true,
        );

        // Reopen settings to avoid stale elements
        await new EditorView().closeAllEditors();
        settingsEditor = await openSettings();
        await updateSettings(
          settingsEditor,
          "ansible.executionEnvironment.containerEngine",
          "podman",
        );

        // Reopen settings again
        await new EditorView().closeAllEditors();
        settingsEditor = await openSettings();
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

        // Poll for output - container startup can be slow even with pre-pulled images
        await waitForCondition({
          condition: async () => {
            text = await terminalView.getText();
            return text.includes("Play ") || text.includes("PLAY [");
          },
          message: `Timed out waiting for ansible-navigator output. Last terminal content: ${text}`,
          timeout: 20000, // Allow time for container startup in CI
          pollTimeout: 200,
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
      // Timeout accounts for: settings operations (10s) + ansible-navigator execution (15s)
      this.timeout(35000);

      // Ensure clean state
      await VSBrowser.instance.driver.switchTo().defaultContent();
      await new EditorView().closeAllEditors();

      // Open fresh settings
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
      // Without containers, ansible-navigator runs locally but CI can be slow
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play ") || text.includes("PLAY [");
        },
        message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
        timeout: 15000, // Allow time for ansible-navigator startup in CI
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
      this.timeout(20000); // Allow time for cleanup settings operationsclear

      const folder = "terminal";
      const fixtureFolder = getFixturePath(folder) + "/";

      // Ensure clean state
      await new EditorView().closeAllEditors();

      // Update first setting
      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.containerEngine",
        "docker",
      );

      // Reopen for second setting to avoid stale elements
      await new EditorView().closeAllEditors();
      settingsEditor = await openSettings();
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
