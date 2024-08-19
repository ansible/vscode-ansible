import {
  ActionsControl,
  ActivityBar,
  By,
  ContextMenu,
  EditorView,
  InputBox,
  ModalDialog,
  VSBrowser,
  WebElement,
  WebView,
  WebviewView,
  Workbench,
} from "vscode-extension-tester";
import {
  expectNotification,
  getFixturePath,
  getModalDialogAndMessage,
  sleep,
  updateSettings,
} from "./uiTestHelper";
import { Key } from "selenium-webdriver";
import { expect } from "chai";
import axios from "axios";

const trialNotificationMessage =
  "Ansible Lightspeed is not configured for your organization, click here to start a 90-day trial.";

export function lightspeedOneClickTrialUITest(): void {
  describe("Test One Click Trial feature", () => {
    let workbench: Workbench;
    let explorerView: WebviewView;
    let modalDialog: ModalDialog;
    let dialogMessage: string;
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
      const { dialog, message } = await getModalDialogAndMessage(true);
      expect(message).equals(
        "The extension 'Ansible' wants to sign in using Ansible Lightspeed.",
      );
      await dialog.pushButton("Allow");
    });

    it("Verify a modal dialog pops up", async () => {
      const { dialog, message } = await getModalDialogAndMessage();
      expect(dialog).not.to.be.undefined;
      expect(message).not.to.be.undefined;
      modalDialog = dialog;
      dialogMessage = message;
    });

    it("Click Open if a dialog shows up for opening the external website", async () => {
      // If the dialog to open the external website is not suppressed, click Open
      if (dialogMessage === "Do you want Code to open the external website?") {
        await modalDialog.pushButton("Configure Trusted Domains");
        const input = await InputBox.create();
        input.confirm();

        const d = await getModalDialogAndMessage();
        modalDialog = d.dialog;
        dialogMessage = d.message;
      }
    });

    it("Click Open to open the callback URI", async () => {
      // Click Open to allow Ansible extension to open the callback URI
      expect(dialogMessage).equals(
        "Allow 'Ansible' extension to open this URI?",
      );
      await modalDialog.pushButton("Open");
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
      await expectNotification("Welcome back ONE_CLICK_USER (unlicensed)");
    });

    it("Verify the Refresh icon is found on the title of Explorer view", async () => {
      const refreshIcon = await explorerView.findWebElement(
        By.xpath("//a[contains(@class, 'codicon-refresh')]"),
      );
      expect(refreshIcon, "refreshIcon should not be undefined").not.to.be
        .undefined;

      // Set "UI Test", One Click" and "Me Uppercase" options for mock server
      await axios.post(
        `${process.env.TEST_LIGHTSPEED_URL}/__debug__/options`,
        ["--ui-test", "--one-click", "--me-uppercase"],
        { headers: { "Content-Type": "application/json" } },
      );

      await refreshIcon.click(); // make sure if it could be clicked

      await sleep(2000);
      await explorerView.switchToFrame(5000);
      const div = await explorerView.findWebElement(
        By.id("lightspeedExplorerView"),
      );
      const text = await div.getText();
      expect(text).contains("LOGGED IN AS: ONE_CLICK_USER (UNLICENSED)");
      await explorerView.switchBack();
    });

    it("Invoke Playbook generation", async () => {
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
      await expectNotification(
        trialNotificationMessage,
        true, // click button
      );
      await new EditorView().closeAllEditors();
    });

    it("Invoke Playbook explanation", async () => {
      const folder = "lightspeed";
      const file = "playbook_4.yml";
      const filePath = getFixturePath(folder, file);

      // Open file in the editor
      await VSBrowser.instance.openResources(filePath);
      await sleep(1000);

      // Open playbook explanation webview.
      await workbench.executeCommand(
        "Explain the playbook with Ansible Lightspeed",
      );
      await sleep(2000);
      await expectNotification(
        trialNotificationMessage,
        true, // click button
      );
      await new EditorView().closeAllEditors();
    });

    it("Invoke Completion", async () => {
      const folder = "lightspeed";
      const file = "playbook_3.yml";
      const filePath = getFixturePath(folder, file);
      await VSBrowser.instance.openResources(filePath);
      await sleep(1000);

      const editorView = new EditorView();
      const tab = await editorView.getTabByTitle(file);
      await tab.select();

      // Trigger completions API. First space key and backspace look redundant,
      // but just sending page down and 4 spaces did not work...
      await tab.sendKeys(" ", Key.BACK_SPACE, Key.PAGE_DOWN, "    ");

      await sleep(4000);
      await expectNotification(
        trialNotificationMessage,
        true, // click button
      );

      // Revert changes made
      await tab.select();
      await tab.sendKeys(Key.CONTROL, "z", "z", "z", Key.NULL);
      await editorView.closeAllEditors();
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
      await expectNotification("Successfully signed out.");
    });
  });
}
