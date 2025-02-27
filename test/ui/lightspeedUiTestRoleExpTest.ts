// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import { By, VSBrowser, EditorView, Workbench } from "vscode-extension-tester";
import * as path from "path";
import {
  getFixturePath,
  getWebviewByLocator,
  workbenchExecuteCommand,
  dismissNotifications,
  waitForCondition,
} from "./uiTestHelper";

config.truncateThreshold = 0;

async function testThumbsButtonInteraction(buttonToClick: string) {
  const folder = path.join("lightspeed", "roles", "example_role", "tasks");
  const filePath = getFixturePath(folder, "main.yml");

  // Open file in the editor
  await VSBrowser.instance.openResources(filePath);

  // Open role explanation webview.
  await workbenchExecuteCommand("Explain the role with Ansible Lightspeed");

  await new EditorView().openEditor("Explanation", 1);
  // Locate the role explanation webview
  const webView = await getWebviewByLocator(
    By.xpath("//div[contains(@class, 'explanation') ]"),
  );

  // Find the main div element of the webview and verify the expected text is found.
  const mainDiv = await webView.findWebElement(
    By.xpath("//div[contains(@class, 'explanation') ]"),
  );
  expect(mainDiv, "mainDiv should not be undefined").not.to.be.undefined;
  const text = await mainDiv.getText();
  expect(text.includes("This is an example role overview.")).to.be.true;

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

  waitForCondition({
    condition: async () => {
      const thumbsUpDisabled = await thumbsUpButton.getAttribute("disabled");
      const thumbsDownDisabled =
        await thumbsDownButton.getAttribute("disabled");
      return thumbsUpDisabled === "true" && thumbsDownDisabled === "true";
    },
  });

  await webView.switchBack();
  await workbenchExecuteCommand("View: Close All Editor Groups");
}

describe("Verify role explanation features work as expected", function () {
  let workbench: Workbench;
  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  before(async function () {
    workbench = new Workbench();
    await workbenchExecuteCommand(
      "Ansible Lightspeed: Enable experimental features",
    );
    await workbenchExecuteCommand("View: Close All Editor Groups");

    await dismissNotifications(workbench);
  });

  it("Role explanation thumbs up/down button disabled after thumbs up", async function () {
    await testThumbsButtonInteraction("thumbsup");
  });

  it("Role explanation thumbs up/down button disabled after thumbs down", async function () {
    await testThumbsButtonInteraction("thumbsdown");
  });
});
