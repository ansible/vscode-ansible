// BEFORE: ansible.lightspeed.enabled: false

import { expect } from "chai";
import { Workbench } from "vscode-extension-tester";
import {
  sleep,
  workbenchExecuteCommand,
  dismissNotifications,
} from "./uiTestHelper";

describe("Verify playbook generation page is not opened when Lightspeed is not enabled", function () {
  let workbench: Workbench;

  before(async function () {
    if (!process.env.TEST_LIGHTSPEED_URL) {
      return;
    }

    await sleep(3000);

    workbench = await new Workbench();
    await dismissNotifications(workbench);
  });

  it("Playbook generation command shows an error message when Lightspeed is not enabled", async function () {
    // Open playbook generation webview.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    if (process.platform === "darwin") {
      this.skip();
    }
    await sleep(3000);
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(5000);
    // DEBUG trace, please remove after 2025-01-01 if the problem doesn't come back
    console.log(workbench);
    const notifications = await workbench.getNotifications();
    console.log(notifications);
    const notification = notifications[0];
    console.log(notification);
    expect(await notification.getMessage()).equals(
      "Enable lightspeed services from settings to use the feature.",
    );
  });
});
