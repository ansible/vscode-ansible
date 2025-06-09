import { expect, config } from "chai";
import fs from "fs";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
  SettingsEditor,
} from "vscode-extension-tester";
import {
  getFixturePath,
  updateSettings,
  sleep,
  waitForCondition,
} from "./uiTestHelper";

config.truncateThreshold = 0;
describe(__filename, function () {
  describe("Verify the execution of playbook using ansible-playbook command", function () {
    let workbench: Workbench;
    let settingsEditor: SettingsEditor;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    before(async function () {
      workbench = new Workbench();
    });

    it("Execute ansible-playbook command with arg", async function () {
      settingsEditor = await workbench.openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      await VSBrowser.instance.openResources(playbookFile);

      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      const text = await terminalView.getText();

      expect(text).contains("ansible-playbook --syntax-check");
      await terminalView.killTerminal();
    });

    it("Execute ansible-playbook command without arg", async function () {
      const settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");
      await VSBrowser.instance.openResources(playbookFile);

      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      const text = await terminalView.getText();

      expect(text).contains("ansible-playbook ");
      expect(text).does.not.contain("ansible-playbook --");

      await terminalView.killTerminal();
    });
  });

  describe("Verify the execution of playbook using ansible-navigator command", function () {
    let workbench: Workbench;
    let settingsEditor: SettingsEditor;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    before(async function () {
      workbench = new Workbench();
    });
    // Skip this test on macOS due to CI container settings
    it("Execute playbook with ansible-navigator EE mode", async function () {
      if (process.platform !== "darwin") {
        settingsEditor = await workbench.openSettings();
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
            return text.includes("Play ");
          },
          message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
          timeout: 20000,
        });

        // assert with just "Play " rather than "Play name" due to CI output formatting issues
        await terminalView.killTerminal();
      }
    });

    it("Execute playbook with ansible-navigator without EE mode", async function () {
      settingsEditor = await workbench.openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        false,
      );
      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand(
        "Run playbook via `ansible-navigator run``",
      );
      // Tried to remove this sleep but that results in a failure in the after block
      // unable to interact with workbench element
      await sleep(7000);

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play ");
        },
        message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
        timeout: 20000,
      });

      await terminalView.killTerminal();

      // assert with just "Play " rather than "Play name" due to CI output formatting issues
      expect(text).contains("Play ");
    });

    after(async function () {
      const folder = "terminal";
      const fixtureFolder = getFixturePath(folder) + "/";
      settingsEditor = await workbench.openSettings();

      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.containerEngine",
        "docker",
      );
      fs.readdirSync(fixtureFolder).forEach((file) => {
        if (file.includes("playbook-artifact")) {
          fs.unlinkSync(fixtureFolder + file);
        }
      });
    });
  });
});
