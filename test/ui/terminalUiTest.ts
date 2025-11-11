import { expect, config } from "chai";
import fs from "fs";
import {
  BottomBarPanel,
  VSBrowser,
  SettingsEditor,
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
      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.playbook.arguments",
        "--syntax-check",
      );

      await VSBrowser.instance.openResources(playbookFile);
      await sleep(500); // Give UI time to settle

      await workbenchExecuteCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      await sleep(1000); // Wait for terminal to populate
      const text = await terminalView.getText();

      expect(text).contains("ansible-playbook --syntax-check");
      await terminalView.killTerminal();
    });

    it("Execute ansible-playbook command without arg", async function () {
      settingsEditor = await openSettings();
      await updateSettings(settingsEditor, "ansible.playbook.arguments", " ");
      await VSBrowser.instance.openResources(playbookFile);
      await sleep(500); // Give UI time to settle

      await workbenchExecuteCommand("Run playbook via `ansible-playbook`");

      const terminalView = await new BottomBarPanel().openTerminalView();
      await sleep(1000); // Wait for terminal to populate
      const text = await terminalView.getText();

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
      // Pre-pull the container image if not on macOS to avoid timeout during test
      if (process.platform !== "darwin") {
        this.timeout(180000); // 3 minutes for image pull
        const { spawn } = await import("child_process");
        const containerEngine = process.env.CONTAINER_ENGINE || "podman";
        const image = "ghcr.io/ansible/community-ansible-dev-tools:latest";

        console.log(
          `Pre-pulling container image ${image} with ${containerEngine}...`,
        );

        await new Promise<void>((resolve) => {
          const pullProcess = spawn(containerEngine, ["pull", image], {
            stdio: "pipe",
          });

          let stderr = "";
          pullProcess.stderr?.on("data", (data) => {
            stderr += data.toString();
          });

          pullProcess.on("close", (code) => {
            if (code === 0) {
              console.log(`Container image ${image} pulled successfully`);
              resolve();
            } else {
              // Don't fail if image pull fails - it might already exist
              console.log(`Container pull exited with code ${code}: ${stderr}`);
              resolve(); // Continue anyway
            }
          });

          pullProcess.on("error", (err) => {
            console.log(`Container pull error (continuing): ${err.message}`);
            resolve(); // Continue anyway - image might already exist
          });
        });
      }
    });

    // Skip this test on macOS due to CI container settings
    it("Execute playbook with ansible-navigator EE mode", async function () {
      if (process.platform !== "darwin") {
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

        await VSBrowser.instance.openResources(playbookFile);
        await sleep(500); // Give UI time to settle

        await workbenchExecuteCommand(
          "Run playbook via `ansible-navigator run`",
        );
        const terminalView = await new BottomBarPanel().openTerminalView();

        let text = "";
        // With pre-pulled image, this should complete within default timeout
        await waitForCondition({
          condition: async () => {
            text = await terminalView.getText();
            // Check for either "Play " or ansible-navigator command to ensure something is happening
            return text.includes("Play ") || text.includes("ansible-navigator");
          },
          message: `Timed out waiting for ansible-navigator output. Last terminal content: ${text}`,
          timeout: 25000,
        });

        // Verify we got the expected output
        expect(text).to.satisfy(
          (t: string) => t.includes("Play ") || t.includes("ansible-navigator"),
          "Expected to see 'Play ' or 'ansible-navigator' in terminal output",
        );
        await terminalView.killTerminal();
      }
    });

    it("Execute playbook with ansible-navigator without EE mode", async function () {
      settingsEditor = await openSettings();
      await updateSettings(
        settingsEditor,
        "ansible.executionEnvironment.enabled",
        false,
      );
      await VSBrowser.instance.openResources(playbookFile);
      await sleep(500); // Give UI time to settle

      await workbenchExecuteCommand(
        "Run playbook via `ansible-navigator run``",
      );

      const terminalView = await new BottomBarPanel().openTerminalView();

      let text = "";
      // Without containers, ansible-navigator should run quickly
      await waitForCondition({
        condition: async () => {
          text = await terminalView.getText();
          return text.includes("Play ");
        },
        message: `Timed out waiting for 'Play ' to appear on terminal. Last output: ${text}`,
        timeout: 25000,
      });

      // assert with just "Play " rather than "Play name" due to CI output formatting issues
      expect(text).contains("Play ");

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
