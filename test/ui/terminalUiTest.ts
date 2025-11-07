import { expect, config } from "chai";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
  EditorView,
} from "vscode-extension-tester";
import { getFixturePath, updateSettings } from "./uiTestHelper";

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

  beforeEach(async function () {
    // Clear cache by closing all editors before each test
    const editorView = new EditorView();
    await editorView.closeAllEditors();
  });

  describe("execution of playbook using ansible-playbook command", function () {
    it("Execute ansible-playbook command WITH arguments", async function () {
      const settingsEditor = await workbench.openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      const text = await terminalView.getText();

      expect(text).to.contain("ansible-playbook");
      expect(text).to.contain("--syntax-check");
    });

    it("Execute ansible-playbook command WITHOUT arguments", async function () {
      const settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");

      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      const text = await terminalView.getText();

      expect(text).to.contain("ansible-playbook");
      expect(text).not.to.contain("--syntax-check");
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    it("Execute ansible-navigator WITH EE mode", async function () {
      const settingsEditor = await workbench.openSettings();
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
      const text = await terminalView.getText();

      expect(text).to.contain("ansible-navigator");
      expect(text).to.contain("--ee");
      expect(text).to.contain("--ce");
      expect(text).to.contain("podman");
    });

    it("Execute ansible-navigator WITHOUT EE mode", async function () {
      const settingsEditor = await workbench.openSettings();
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
      const text = await terminalView.getText();

      expect(text).to.contain("ansible-navigator");
      expect(text).not.to.contain("--ee");
    });
  });
});
