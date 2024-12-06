// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import { By, VSBrowser, EditorView, WebView } from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify playbook explanation features work as expected", function () {
  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  it("Playbook explanation webview with a playbook with no tasks", async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    const folder = "lightspeed";
    const file = "playbook_5.yml";
    const filePath = getFixturePath(folder, file);

    // Open file in the editor
    await VSBrowser.instance.openResources(filePath);

    // Open playbook explanation webview.
    await workbenchExecuteCommand(
      "Explain the playbook with Ansible Lightspeed",
    );
    await sleep(2000);

    await new EditorView().openEditor("Explanation", 1);
    // Locate the playbook explanation webview
    const webView = await getWebviewByLocator(
      By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
    );
    // Find the main div element of the webview and verify the expected text is found.
    const mainDiv = await webView.findWebElement(
      By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
    );
    expect(mainDiv, "mainDiv should not be undefined").not.to.be.undefined;
    const text = await mainDiv.getText();
    expect(
      text.includes(
        "Explaining a playbook with no tasks in the playbook is not supported.",
      ),
    ).to.be.true;

    await webView.switchBack();
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });
});

describe("Feedback webview provider works as expected", function () {
  let editorView: EditorView;

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
    await workbenchExecuteCommand("View: Close All Editor Groups");
    editorView = new EditorView();
    expect(editorView).not.to.be.undefined;
  });

  it("Open Feedback webview", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    await workbenchExecuteCommand("Ansible Lightspeed: Feedback");
    await sleep(2000);
    // Locate the playbook explanation webview
    const webView = (await editorView.openEditor(
      "Ansible Lightspeed Feedback",
    )) as WebView;
    expect(webView, "webView should not be undefined").not.to.be.undefined;
    // Issuing the Lightspeed feedback command should not open a new tab
    await workbenchExecuteCommand("Ansible Lightspeed: Feedback");
    await sleep(2000);
    const titles = await editorView.getOpenEditorTitles();
    expect(titles.length).equals(1);
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });
});
