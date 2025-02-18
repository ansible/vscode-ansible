// BEFORE: ansible.lightspeed.suggestions.enabled: true

import { expect, config } from "chai";
import { VSBrowser, Workbench, EditorView } from "vscode-extension-tester";
import { getFixturePath, sleep, workbenchExecuteCommand } from "./uiTestHelper";

config.truncateThreshold = 0;

describe("Verify playbook generation features work as expected", function () {
  beforeEach(function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    // Dismiss all notifications
    const workbench = new Workbench();
    workbench.getNotifications().then((notifications) => {
      notifications.forEach(async (notification) => {
        await notification.dismiss();
      });
    });
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

  it("Ansible Lightspeed: Playbook generation shows notification when user is not logged in", async function () {
    // Execute only when TEST_LIGHTSPEED_URL environment variable is defined.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }

    // Open playbook generation webview.
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");

    await sleep(2000);

    const workbench = new Workbench();
    const notifications = await workbench.getNotifications();
    expect(notifications.length).greaterThan(0);
    const userNotLoggedInError = notifications.find(async (notification) => {
      return (await notification.getMessage()).includes(
        "Log in to Ansible Lightspeed to use this feature.",
      );
    });
    expect(userNotLoggedInError).to.be.not.undefined;
  });
});
