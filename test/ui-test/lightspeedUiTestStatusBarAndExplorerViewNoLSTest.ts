// BEFORE: ansible.lightspeed.enabled: false

import { expect, config } from "chai";
import { By, StatusBar, VSBrowser, EditorView } from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  workbenchExecuteCommand,
  getWebviewByLocator,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify the presence of lightspeed element in the status bar and the explorer view", () => {
  let statusBar: StatusBar;
  let editorView: EditorView;
  const folder = "lightspeed";
  const file = "playbook_1.yml";
  const filePath = getFixturePath(folder, file);

  before(async function () {
    statusBar = new StatusBar();
    editorView = new EditorView();

    // open file in the editor
    await VSBrowser.instance.openResources(filePath);
  });

  it("Ansible Lightspeed status bar item absent when settings not enabled", async function () {
    await editorView.openEditor(file);

    // The following lines replaced the original code that was using StatusBar.getItem() API.
    const items = await statusBar.findElements(
      By.xpath(
        "//div[contains(@class, 'statusbar-item') and " +
          ".//a/text()='Lightspeed (not logged in))']",
      ),
    );
    expect(items.length).equals(0);
  });

  it("Connect button exists in Lightspeed explorer view when settings not enabled", async function () {
    await workbenchExecuteCommand("Ansible: Focus on Ansible Lightspeed View");
    await sleep(5000);
    const explorerView = await getWebviewByLocator(
      By.id("lightspeed-explorer-connect"),
    );
    await explorerView.switchBack();
  });
});
