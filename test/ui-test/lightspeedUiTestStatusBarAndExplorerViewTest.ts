// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import { By, StatusBar, VSBrowser, EditorView } from "vscode-extension-tester";
import {
  getFixturePath,
  updateSettings,
  openSettings,
  sleep,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify the presence of lightspeed element in the status bar and the explorer view", () => {
  const folder = "lightspeed";
  const file = "playbook_1.yml";
  const filePath = getFixturePath(folder, file);

  before(async function () {
    // open file in the editor
    await VSBrowser.instance.openResources(filePath);
  });
  it("Ansible Lightspeed status bar item present when lightspeed and lightspeed suggestions are enabled (with normal color)", async () => {
    const statusBar = new StatusBar();
    const editorView = new EditorView();
    await editorView.openEditor(file);

    // The following lines replaced the original code that was using StatusBar.getItem() API.
    const lightspeedStatusBarItem = await statusBar.findElement(
      By.xpath(
        "//div[contains(@class, 'statusbar-item') and " +
          "not (contains(@class, 'has-background-color')) and " +
          ".//a/text()='Lightspeed (Not logged in)']",
      ),
    );
    expect(lightspeedStatusBarItem).not.to.be.undefined;
  });
  it.skip("Ansible Lightspeed status bar item present when only lightspeed is enabled (with warning color)", async () => {
    const statusBar = new StatusBar();
    const editorView = new EditorView();
    const settingsEditor = await openSettings();
    await updateSettings(
      settingsEditor,
      "ansible.lightspeed.suggestions.enabled",
      false,
    );
    await editorView.openEditor(file);
    await sleep(3000);

    // The following lines replaced the original code that was using StatusBar.getItem() API.
    const lightspeedStatusBarItem = await statusBar.findElement(
      By.xpath(
        "//div[contains(@class, 'statusbar-item') and " +
          "contains(@class, 'has-background-color') and " +
          "contains(@class, 'warning-kind') and " +
          ".//a/text()='Lightspeed (Not logged in)']",
      ),
    );
    expect(lightspeedStatusBarItem).not.to.be.undefined;
  });
});
