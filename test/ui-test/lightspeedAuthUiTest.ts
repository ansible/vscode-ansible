import {
  ActionsControl,
  ActivityBar,
  By,
  ContextMenu,
  ModalDialog,
  WebviewView,
  Workbench,
} from "vscode-extension-tester";
import {
  getModalDialogAndMessage,
  sleep,
  updateSettings,
} from "./uiTestHelper";
import { expect } from "chai";

export function lightspeedUIAuthTest(): void {
  // Execute only on Linux
  if (process.platform !== "linux") {
    return;
  }

  describe("Login to Lightspeed", () => {
    let workbench: Workbench;
    let explorerView: WebviewView;

    before(async () => {
      // Enable Lightspeed and open Ansible Light view on sidebar
      workbench = new Workbench();
      const settingsEditor = await workbench.openSettings();
      await updateSettings(settingsEditor, "ansible.lightspeed.enabled", true);
      await updateSettings(
        settingsEditor,
        "ansible.lightspeed.URL",
        process.env.TEST_LIGHTSPEED_URL,
      );
    });

    it("Focus on Ansible Lightspeed View", async () => {
      await new Workbench().executeCommand(
        "Ansible: Focus on Ansible Lightspeed View",
      );
      await sleep(3000);
      explorerView = new WebviewView();
      expect(explorerView, "contentCreatorWebView should not be undefined").not
        .to.be.undefined;
    });

    it("Click Connect button Ansible Lightspeed webview", async () => {
      await explorerView.switchToFrame(5000);
      const connectButton = await explorerView.findWebElement(
        By.id("lightspeed-explorer-connect"),
      );
      expect(connectButton).not.to.be.undefined;
      if (connectButton) {
        await connectButton.click();
      }
      await explorerView.switchBack();
    });

    it("Click Allow to use Lightspeed", async () => {
      // Click Allow to use Lightspeed
      const dialog = new ModalDialog();
      const details = await dialog.getDetails();
      expect(details).equals(
        "The extension 'Ansible' wants to sign in using Ansible Lightspeed.",
      );
      await dialog.pushButton("Allow");
    });

    it("Click Open to open the external website and the callback URI", async () => {
      let { dialog, message } = await getModalDialogAndMessage();

      // If the dialog to open the external website is not suppressed, click Open
      if (message === "Do you want Code to open the external website?") {
        await dialog.pushButton("Open");
        const d = await getModalDialogAndMessage();
        dialog = d.dialog;
        message = d.message;
      }

      // Click Open to allow Ansible extension to open the callback URI
      expect(message).equals("Allow 'Ansible' extension to open this URI?");
      await dialog.pushButton("Open");
      await sleep(2000);
    });

    it("Verify Ansible Lightspeed webview now contains user's information", async () => {
      await explorerView.switchToFrame(5000);
      const div = await explorerView.findWebElement(
        By.id("lightspeedExplorerView"),
      );
      const text = await div.getText();
      expect(text).contains("Logged in as:");
      await explorerView.switchBack();
    });

    it("Sign out using Accounts global action", async () => {
      const activityBar = new ActivityBar();
      const actions = (await activityBar.getGlobalAction(
        "Accounts",
      )) as ActionsControl;
      expect(actions).not.to.be.undefined;
      await actions?.click();
      const menus = await workbench.findElements(By.className("context-view"));
      expect(menus.length).greaterThan(0);
      const menu = new ContextMenu(workbench);
      expect(menu).not.to.be.undefined;
      if (menu) {
        await menu.select(
          "EXTERNAL_USERNAME (licensed) (Ansible Lightspeed)",
          "Sign Out",
        );
      }
    });

    it("Click Sign Out button on the modal dialog", async () => {
      const dialog = new ModalDialog();
      expect(dialog).not.to.be.undefined;
      await dialog.pushButton("Sign Out");
    });

    it("Verify the notification message", async () => {
      await sleep(1000);
      const notifications = await workbench.getNotifications();
      const notification = notifications[0];
      const message = await notification.getMessage();
      expect(message).equals("Successfully signed out.");
      await notification.dismiss();
    });
  });
}
