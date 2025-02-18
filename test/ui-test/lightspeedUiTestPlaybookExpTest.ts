// BEFORE: ansible.lightspeed.suggestions.enabled: true

import { expect, config } from "chai";
import { By, VSBrowser, EditorView, WebView } from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  getWebviewByLocator,
  workbenchExecuteCommand,
} from "./uiTestHelper";

config.truncateThreshold = 0;

async function testThumbsButtonInteraction(buttonToClick: string) {
  const folder = "lightspeed";
  const filePath = getFixturePath(folder, "playbook_1.yml");

  // Open file in the editor
  await VSBrowser.instance.openResources(filePath);

  // Open playbook explanation webview.
  await workbenchExecuteCommand("Explain the playbook with Ansible Lightspeed");
  await sleep(2000);

  await new EditorView().openEditor("Explanation", 1);
  // Locate the playbook explanation webview
  const webView = await getWebviewByLocator(
    By.xpath("//div[contains(@class, 'playbookGeneration') ]"),
  );
  const thumbsUpButton = await webView.findWebElement(
    By.xpath("//vscode-button[@id='thumbsup-button']"),
  );
  expect(thumbsUpButton, "thumbsUpButton should not be undefined").not.to.be
    .undefined;

  const thumbsDownButton = await webView.findWebElement(
    By.xpath("//vscode-button[@id='thumbsdown-button']"),
  );
  expect(thumbsDownButton, "thumbsDownButton should not be undefined").not.to.be
    .undefined;

  expect(
    await thumbsUpButton.isEnabled(),
    `Thumbs up button should be enabled now`,
  ).to.be.true;

  expect(
    await thumbsDownButton.isEnabled(),
    `Thumbs down button should be enabled now`,
  ).to.be.true;

  const button =
    buttonToClick === "thumbsup" ? thumbsUpButton : thumbsDownButton;
  await button.click();

  await sleep(2000);

  expect(
    await thumbsUpButton.getAttribute("disabled"),
    "Thumbs up button should be disabled now",
  ).equals("true");

  expect(
    await thumbsDownButton.getAttribute("disabled"),
    "Thumbs down button should be disabled now",
  ).equals("true");

  await webView.switchBack();
  await workbenchExecuteCommand("View: Close All Editor Groups");
}

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

  it("Playbook explanation thumbs up/down button disabled after thumbs up", async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    await testThumbsButtonInteraction("thumbsup");
  });

  it("Playbook explanation thumbs up/down button disabled after thumbs down", async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    await testThumbsButtonInteraction("thumbsdown");
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
