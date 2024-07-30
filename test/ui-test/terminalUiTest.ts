import { expect, config } from "chai";
import fs from "fs";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
  SettingsEditor,
} from "vscode-extension-tester";
import { getFixturePath, updateSettings, sleep } from "./uiTestHelper";

config.truncateThreshold = 0;

export function terminalUITests(): void {
  describe("Verify the execution of playbook using ansible-playbook command", () => {
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
  describe("Verify the execution of playbook using ansible-navigator command", () => {
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
        await sleep(3500);

        const terminalView = await new BottomBarPanel().openTerminalView();
        const text = await terminalView.getText();

        // assert with just "Play " rather than "Play name" due to CI output formatting issues
        expect(text).contains("Play ");
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
      await sleep(3000);

      const terminalView = await new BottomBarPanel().openTerminalView();
      const text = await terminalView.getText();
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
}
