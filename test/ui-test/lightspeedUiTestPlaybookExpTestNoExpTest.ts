// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import { By, VSBrowser, EditorView } from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify playbook explanation features when no explanation is returned", function () {
  let editorView: EditorView;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  it("Playbook explanation webview works as expected, no explanation", async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    const folder = "lightspeed";
    const file = "playbook_explanation_none.yml";
    const filePath = getFixturePath(folder, file);

    // Open file in the editor
    await VSBrowser.instance.openResources(filePath);

    // Open playbook explanation webview.
    await workbenchExecuteCommand(
      "Explain the playbook with Ansible Lightspeed",
    );
    await sleep(5000);

    // Locate the playbook explanation webview
    await new EditorView().openEditor("Explanation", 1);
    const webView = await getWebviewByLocator(
      By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
    );

    // Find the main div element of the webview and verify the expected text is found.
    const mainDiv = await webView.findWebElement(
      By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
    );
    expect(mainDiv, "mainDiv should not be undefined").not.to.be.undefined;
    await sleep(5000);
    const text = await mainDiv.getText();
    expect(text.includes("No explanation provided")).to.be.true;

    await webView.switchBack();
    editorView = new EditorView();
    if (editorView) {
      await editorView.closeAllEditors();
    }
  });
});
