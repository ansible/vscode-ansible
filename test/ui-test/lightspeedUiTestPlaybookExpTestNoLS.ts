import { expect } from "chai";
import { Workbench } from "vscode-extension-tester";
import {
  sleep,
  updateSettings,
  workbenchExecuteCommand,
  openSettings,
} from "./uiTestHelper";

describe("Verify playbook generation page is not opened when Lightspeed is not enabled", function () {
  before(async function () {
    // await workbenchExecuteCommand(
    //   "Ansible Lightspeed: Enable experimental features",
    // );
    const settingsEditor = await openSettings();
    await updateSettings(settingsEditor, "ansible.lightspeed.enabled", false);
    await workbenchExecuteCommand("View: Close All Editor Groups");
  });

  it("Playbook generation command shows an error message when Lightspeed is not enabled", async function () {
    // Open playbook generation webview.
    if (!process.env.TEST_LIGHTSPEED_URL) {
      this.skip();
    }
    await workbenchExecuteCommand("Ansible Lightspeed: Playbook generation");
    await sleep(2000);
    const notifications = await new Workbench().getNotifications();
    const notification = notifications[0];
    expect(await notification.getMessage()).equals(
      "Enable lightspeed services from settings to use the feature.",
    );
  });
});
