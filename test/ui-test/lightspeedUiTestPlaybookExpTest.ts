// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import {
  By,
  Workbench,
  VSBrowser,
  EditorView,
  SettingsEditor,
  WebView,
} from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  updateSettings,
  getWebviewByLocator,
  workbenchExecuteCommand,
  openSettings,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify playbook explanation features work as expected", function () {
  let workbench: Workbench;

  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    workbench = new Workbench();
    // await workbenchExecuteCommand(
    //   "Ansible Lightspeed: Enable experimental features",
    // );
    await workbenchExecuteCommand("View: Close All Editor Groups");

    const notifications = await workbench.getNotifications();
    for (let i = 0; i < notifications.length; i++) {
      const n = notifications[i];
      await n.dismiss();
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
    console.log(`text: ${text}`);
    expect(text.includes("No explanation provided")).to.be.true;

    await webView.switchBack();
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });
});

describe("Feedback webview provider works as expected", function () {
  let editorView: EditorView;
  let settingsEditor: SettingsEditor;

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }
    settingsEditor = await openSettings();
    await workbenchExecuteCommand("View: Close All Editor Groups");
    editorView = new EditorView();
    expect(editorView).not.to.be.undefined;
  });

  it("Open Feedback webview", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
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
