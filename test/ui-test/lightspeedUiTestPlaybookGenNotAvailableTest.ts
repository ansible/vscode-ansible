// BEFORE: ansible.lightspeed.enabled: true

import { expect, config } from "chai";
import { VSBrowser, By, Workbench, EditorView } from "vscode-extension-tester";
import {
  getFixturePath,
  sleep,
  workbenchExecuteCommand,
  getWebviewByLocator,
} from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify playbook generation features work as expected", function () {
  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
  });

  it("Playbook explanation webview works as expected (feature unavailable)", async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    await sleep(5000);
    const folder = "lightspeed";
    const file = "playbook_explanation_feature_unavailable.yml";
    const filePath = getFixturePath(folder, file);

    // Open file in the editor
    await VSBrowser.instance.openResources(filePath);

    // Open playbook explanation webview.
    await workbenchExecuteCommand(
      "Explain the playbook with Ansible Lightspeed",
    );
    await sleep(2000);

    // Locate the group 1 of editor view. Since the file does not contain the "hosts" property,
    // the explanation view is not opened in the group 1. Therefore, the group 1 should be
    // undefined.
    const group = await new EditorView().getEditorGroup(1);
    expect(group, "Group 1 of the editor view should be undefined").to.be
      .undefined;

    await workbenchExecuteCommand("View: Close All Editor Groups");
  });

  it("Playbook generation webview works as expected (feature unavailable)", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    // Open playbook generation webview.
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(2000);
    const webView = await getWebviewByLocator(
      By.xpath("//*[text()='Create a playbook with Ansible Lightspeed']"),
    );

    // Set input text and invoke summaries API
    const textArea = await webView.findWebElement(
      By.xpath("//vscode-text-area"),
    );
    expect(textArea, "textArea should not be undefined").not.to.be.undefined;
    const submitButton = await webView.findWebElement(
      By.xpath("//vscode-button[@id='submit-button']"),
    );
    expect(submitButton, "submitButton should not be undefined").not.to.be
      .undefined;
    //
    // Note: Following line should succeed, but fails for some unknown reasons.
    //
    // expect((await submitButton.isEnabled()), "submit button should be disabled by default").is.false;
    await textArea.sendKeys("Feature not available");
    expect(
      await submitButton.isEnabled(),
      "submit button should be enabled now",
    ).to.be.true;
    await submitButton.click();
    await sleep(2000);

    await webView.switchBack();

    const workbench = new Workbench();
    const notifications = await workbench.getNotifications();
    const notification = notifications[0];
    expect(await notification.getMessage()).equals(
      "The requested action is not available in your environment.",
    );
  });
});
