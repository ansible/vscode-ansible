import { expect, config } from "chai";
import {
  Workbench,
  BottomBarPanel,
  VSBrowser,
  EditorView,
} from "vscode-extension-tester";
import {
  getFixturePath,
  updateSettingsProgrammatically,
  waitForCondition,
  sleep,
} from "./uiTestHelper";

config.truncateThreshold = 0;

// UI tests using stub executables for ansible-playbook and ansible-navigator
// Stubs execute in <100ms - test time is VS Code UI automation overhead
describe(__filename, function () {
    let workbench: Workbench;
    const folder = "terminal";
    const file = "playbook.yml";
    const playbookFile = getFixturePath(folder, file);

    before(async function () {
      workbench = new Workbench();
    });

  afterEach(async function () {
    try {
      await new EditorView().closeAllEditors();
    } catch {
      // Ignore
    }
  });

  describe("execution of playbook using ansible-playbook command", function () {
    it("Execute ansible-playbook command with arg", async function () {
      // Small delay for first test to let VS Code stabilize
      await sleep(300);
      // Update settings via file modification + quick reload (much faster than UI)
      await updateSettingsProgrammatically(
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      await VSBrowser.instance.openResources(playbookFile);
      await sleep(150);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("PLAY [") && text.includes("PLAY RECAP");
        },
        message: `Timed out waiting for playbook execution. Output: ${text}`,
        timeout: 3000,
      });

      // Verify playbook actually executed (not just command echoed)
      expect(text).contains("PLAY [Test Playbook]");
      expect(text).contains("TASK [Gathering Facts]");
      expect(text).contains("PLAY RECAP");
      expect(text).contains("ok=1");
      await terminalView.killTerminal();
    });

    it("Execute ansible-playbook command without arg", async function () {
      // Update settings via file modification + quick reload (much faster than UI)
      await updateSettingsProgrammatically("ansible.playbook.arguments", " ");

      await VSBrowser.instance.openResources(playbookFile);
      await sleep(150);
      await workbench.executeCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("PLAY [") && text.includes("PLAY RECAP");
        },
        message: `Timed out waiting for playbook execution. Output: ${text}`,
        timeout: 3000,
      });

      // Verify playbook actually executed
      expect(text).contains("PLAY [Test Playbook]");
      expect(text).contains("TASK [Gathering Facts]");
      expect(text).contains("PLAY RECAP");
      expect(text).contains("ok=1");
      await terminalView.killTerminal();
    });
  });

  describe("execution of playbook using ansible-navigator command", function () {
    it("Execute playbook with ansible-navigator EE mode", async function () {
      // Batch update multiple settings in one call (saves ~500-1000ms)
      await updateSettingsProgrammatically({
        "ansible.executionEnvironment.enabled": true,
        "ansible.executionEnvironment.containerEngine": "podman",
      });

        await VSBrowser.instance.openResources(playbookFile);
      await sleep(150);
        await workbench.executeCommand(
          "Run playbook via `ansible-navigator run`",
        );

        const terminalView = await new BottomBarPanel().openTerminalView();
        let text = "";
        await waitForCondition({
          condition: async () => {
            text = await terminalView.getText();
          return text.includes("Play [play_") && text.includes("Complete [play_");
          },
        message: `Timed out waiting for navigator execution. Output: ${text}`,
        timeout: 3000,
        });

      // Verify navigator actually executed with TUI output
      expect(text).contains("Play [play_0]");
      expect(text).contains("task_0  Gathering Facts");
      expect(text).contains("Result [task_0]");
      expect(text).contains("Complete [play_0]");
      expect(text).contains("ok=1");
        await terminalView.killTerminal();
    });

    it("Execute playbook with ansible-navigator without EE mode", async function () {
      // Update settings via file modification + quick reload (much faster than UI)
      await updateSettingsProgrammatically(
        "ansible.executionEnvironment.enabled",
        false,
      );

      await VSBrowser.instance.openResources(playbookFile);
      await sleep(150);
      await workbench.executeCommand(
        "Run playbook via `ansible-navigator run`",
      );

      const terminalView = await new BottomBarPanel().openTerminalView();
      let text = "";
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play [play_") && text.includes("Complete [play_");
        },
        message: `Timed out waiting for navigator execution. Output: ${text}`,
        timeout: 3000,
      });

      // Verify navigator actually executed with TUI output
      expect(text).contains("Play [play_0]");
      expect(text).contains("task_0  Gathering Facts");
      expect(text).contains("Result [task_0]");
      expect(text).contains("Complete [play_0]");
      expect(text).contains("ok=1");
      await terminalView.killTerminal();
    });

    after(async function () {
      try {
        // Cleanup: Reset settings programmatically
        await updateSettingsProgrammatically(
        "ansible.executionEnvironment.containerEngine",
        "docker",
      );
      } catch {
        // Ignore cleanup errors
        }
    });
  });
});
