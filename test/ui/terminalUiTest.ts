import { expect, config } from "chai";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
} from "vscode-extension-tester";
import { getFixturePath, waitForCondition } from "./uiTestHelper";

config.truncateThreshold = 0;

/**
 * Terminal UI Tests - Dry-Run Mode
 * 
 * These tests verify that the extension correctly constructs and sends commands
 * to the terminal. With dry-run mode enabled (ansible.test.dryRun: true), the
 * extension echoes commands instead of executing them.
 * 
 * This makes tests:
 * - Fast (no real ansible execution)
 * - Reliable (no external dependencies)
 * - Focused (tests command construction, not ansible behavior)
 */
describe(__filename, function () {
  describe("execution of playbook using ansible-playbook command", function () {
    let workbench: Workbench;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    before(async function () {
      workbench = new Workbench();
    });

    it("Execute ansible-playbook command (verifies command construction)", async function () {
      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      
      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("ansible-playbook") && text.includes(file);
        },
        message: `Expected to see ansible-playbook command. Got: ${text}`,
        timeout: 5000,
      });

      // Verify the command was constructed correctly
      expect(text).to.contain("ansible-playbook");
      expect(text).to.contain(file);
      await terminalView.killTerminal();
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    let workbench: Workbench;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    before(async function () {
      workbench = new Workbench();
    });

    it("Execute ansible-navigator command (verifies command construction)", async function () {
      await VSBrowser.instance.openResources(playbookFile);
      await workbench.executeCommand("Run playbook via `ansible-navigator run`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      
      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          // With dry-run, we see the command echoed
          return text.includes("ansible-navigator") && text.includes("run");
        },
        message: `Expected to see ansible-navigator command. Got: ${text}`,
        timeout: 5000,
      });

      // Verify the command was constructed correctly
      expect(text).to.contain("ansible-navigator");
      expect(text).to.contain("run");
      expect(text).to.contain(file);
      await terminalView.killTerminal();
    });
  });
});
