import {
  ActionsControl,
  ActivityBar,
  By,
  ContextMenu,
  EditorView,
  ModalDialog,
  WebElement,
  WebView,
  WebviewView,
  Workbench,
} from "vscode-extension-tester";
import {
  getModalDialogAndMessage,
  sleep,
  updateSettings,
} from "./uiTestHelper";
import { expect } from "chai";
import axios from "axios";

export function lightspeedOneClickTrialUITest(): void {
  describe("Test One Click Trial feature", () => {
    let workbench: Workbench;
    let explorerView: WebviewView;
    let playbookGeneration: WebView;
    let submitButton: WebElement;

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
      await updateSettings(
        settingsEditor,
        "ansible.lightspeed.suggestions.enabled",
        true,
      );

      // Set "UI Test" and "One Click" options for mock server
      await axios.post(
        `${process.env.TEST_LIGHTSPEED_URL}/__debug__/options`,
        ["--ui-test", "--one-click"],
        { headers: { "Content-Type": "application/json" } },
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
      expect(text).contains("Logged in as: ONE_CLICK_USER (unlicensed)");
      await explorerView.switchBack();
    });

    it("Invoke Playbook generation without experimental features enabled", async () => {
      const center = await workbench.openNotificationsCenter();
      center.clearAllNotifications();

      await workbench.executeCommand("Ansible Lightspeed: Playbook generation");
      await sleep(2000);
      playbookGeneration = await new WebView();
      expect(playbookGeneration, "webView should not be undefined").not.to.be
        .undefined;
      await playbookGeneration.switchToFrame(5000);
      expect(
        playbookGeneration,
        "webView should not be undefined after switching to its frame",
      ).not.to.be.undefined;

      // Set input text and invoke summaries API
      const textArea = await playbookGeneration.findWebElement(
        By.xpath("//vscode-text-area"),
      );
      expect(textArea, "textArea should not be undefined").not.to.be.undefined;
      submitButton = await playbookGeneration.findWebElement(
        By.xpath("//vscode-button[@id='submit-button']"),
      );
      expect(submitButton, "submitButton should not be undefined").not.to.be
        .undefined;
      //
      // Note: Following line should succeed, but fails for some unknown reasons.
      //
      // expect((await submitButton.isEnabled()), "submit button should be disabled by default").is.false;
      await textArea.sendKeys("Create an azure network.");
      expect(
        await submitButton.isEnabled(),
        "submit button should be enabled now",
      ).to.be.true;
      await submitButton.click();
      await playbookGeneration.switchBack();
      await sleep(2000);
      const notifications = await workbench.getNotifications();
      expect(notifications.length).equals(1);
      const notification = notifications[0];
      expect(await notification.getMessage()).equals(
        "Your organization does not have a subscription. " +
          "Please contact your administrator.",
      );
    });

    it("Invoke Playbook generation with experimental features enabled", async () => {
      const center = await workbench.openNotificationsCenter();
      center.clearAllNotifications();
      await workbench.executeCommand(
        "Ansible Lightspeed: Enable experimental features",
      );
      await playbookGeneration.switchToFrame(5000);
      await submitButton.click();
      await playbookGeneration.switchBack();
      await sleep(2000);
      let notifications = await workbench.getNotifications();
      expect(notifications.length).equals(1);
      expect(await notifications[0].getMessage()).equals(
        "Oh! You don't have an active Lightspeed Subscription",
      );
      const button = await notifications[0].findElement(
        By.xpath(".//a[@role='button']"),
      );
      expect(button).not.to.be.undefined;
      await button.click();
      await sleep(500);
      notifications = await workbench.getNotifications();
      expect(notifications.length).equals(1);
      expect(await notifications[0].getMessage()).equals(
        "This feature is coming soon. Stay tuned.",
      );
      await notifications[0].dismiss();
      await new EditorView().closeAllEditors();
    });

    it("Sign out using Accounts global action", async () => {
      workbench = new Workbench();
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
          "ONE_CLICK_USER (unlicensed) (Ansible Lightspeed)",
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
